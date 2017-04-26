var logger = require("../logger")(); // logger iséo

var pg = require('pg');
var util = require('../util');
var moment = require('moment');
var momentz = require('moment-timezone');
var aSync = require('async');
var _ = require("underscore");

// fonction de connection pour l'async/waterfall
var connect = function(cb) {

    pg.connect(connectionString, function(err, client, done) {

        return cb(err, client, done); // erreur, parametre 1, parametre2
    });
};

var db_global = require('./db_global');
var connectionString  = db_global.getConnectionString();
var isPgConnectionKO  = db_global.isPgConnectionKO;
var handleQueryError  = db_global.handleQueryError;

// ----------------------- NOTIFICATION  ----------------------

module.exports.getNotifyTarget = function(idsites, callback) {

    //logger.trace("get notify target list from db ...");

    // get a pg client from the connection pool
    pg.connect(connectionString, function(err, client, done) {

        // handle the error of connection
        if( isPgConnectionKO( err, done, callback )) { return; }
        
        /* on recupere les lsessionid des users supposés être connectés
           qui ont dans leur scope des sites pour lesquels on vient de recevoir des notifications d'integrations
        */

        var sql = "SELECT distinct lsessionid ";
        sql += "FROM session ss, login l, equipment_assignment ea ";
        sql += "WHERE ss.idlog = l.idlog ";
        sql += "AND l.idcust = ea.idcust ";
        sql += "AND ss.dateaccess > (current_timestamp - (60 * interval '1 minute')) "; // vérification que la session n'est pas expiré (1 heure max)

        // les stations que l'utilisateurs a dans son scope du a son id de customer

        sql += "AND ea.idsite in (";

        for( var i = 0, max = idsites.length; i < max; i++ )
        {
            if (i > 0) sql += ",";
            sql += "'" + idsites[i] + "'";
        }
        sql += ") ";

        //logger.trace( "request : %s", sql );

        var query = client.query(sql);

        query.on('error', function(error) {
            logger.trace("ERROR : " + error.message);
            handleQueryError( done, callback );
        });

        query.on('row', function(row, results) {
            
            //logger.trace("%j", row);
            results.addRow(row); // accumule les records dans l'objets result, cela permettra d'utiliser result.rows[] dans le gestionnaire de l'event 'end'
        });

        query.on('end', function(result) {

            if( result.rows.length > 0 )
            {
                logger.trace("get notify target list return %s row(s)", result.rows.length );
            }

            done();
            callback(result.rows);
        });
    });
};

// ----------------------- CONSULTATION  ----------------------

module.exports.getUserInfo = function(userSettings, callback) {

    var idlog = userSettings.idlog;

    //logger.trace( "get userinfo from db ...");

    // get a pg client from the connection pool
    pg.connect(connectionString, function(err, client, done) {

        // handle the error of connection
        if( isPgConnectionKO( err, done, callback )) { return; }

        // request ...

        var params = [idlog];
        
        var sql = "SELECT s.lsessionid, ";
        sql +=    "l.idlog, l.login, l.firstname, l.surname, l.tzdisplay, ";
        sql +=    "lg.english_name lng ";
        sql +=    "FROM session s ";
        sql +=    "INNER JOIN login l ON l.idlog = s.idlog ";
        sql +=    "INNER JOIN language lg ON l.idlng = lg.idlng ";
        sql +=    "WHERE l.idlog = $1 ";        
        
        logger.trace( "request : %s", sql );

        var query = client.query(sql, params);

        query.on('error', function(error) {
            logger.trace("error on request : %s params =%j", sql, params);
            logger.error("ERROR : " + error.message);
            handleQueryError( done, callback );
        });

        query.on('row', function(row, results) {
            //logger.trace( "%j", row );
            results.addRow(row); // accumule les records dans l'objets result, cela permettra d'utiliser result.rows[] dans le gestionnaire de l'event 'end'
        });

        query.on('end', function(result) {
            done();
            
            var user = userSettings.login + "-L" + userSettings.idlog + "C" + userSettings.idcust;
            logger.trace("api user info for %s return %d row(s)", user, result.rows.length);
            callback( { userinfo : result.rows }, 200 );
        });
    });
};

module.exports.getPhysicals = function(userSettings, callback) {

    //var idlog = userSettings.idlog;
    var idcust = userSettings.idcust;

    //logger.trace( "get physicals from db for idlog =%d ...", idlog );

    // get a pg client from the connection pool
    pg.connect(connectionString, function(err, client, done) {

        // handle the error of connection
        if( isPgConnectionKO( err, done, callback )) { return; }

        // request ...

        var params = [ idcust ];

        var sql = "SELECT distinct ";
        sql += "p.idphy, p.type, p.tagtype, p.code, p.tagcode, p.cchim ";
        sql += "FROM equipment_assignment ea ";
        sql += "INNER JOIN measure m ON m.idass = ea.idass ";
        sql += "INNER JOIN physical p ON p.idphy = m.idphy ";
        sql += "WHERE ";
        sql += "COALESCE( ea.status, 0 ) >= 2 AND ea.idcust = $1 ";
        sql += "ORDER BY idphy asc ";

        //logger.trace( "request : %s", sql );

        var query = client.query( sql, params );

        query.on('error', function(error) {
            logger.trace("error on request : %s params =%j", sql, params);
            logger.error("ERROR : " + error.message);
            handleQueryError( done, callback );
        });

        query.on('row', function(row, results) {
            //logger.trace( "%j", row );
            results.addRow(row); // accumule les records dans l'objets result, cela permettra d'utiliser result.rows[] dans le gestionnaire de l'event 'end'
            // on ajoute une propriété
            row.thresholds = [];
        });

        query.on('end', function(result) {

            var answer = result.rows;

            if( answer.length == 0 )
            {
                // on sort
                done();
                callback( { physicals : [] }, 200 );
                return;
            }

            // maintenant on recherche pour chaque polluant les eventuels seuils définis pour ce client (il peut ne pas y avoir de seuils définis)

            var listPhy = "(";
            result.rows.forEach(function(item, index, array) {
                if( index > 0 ) { listPhy += ","; }
                listPhy += "'" + item.idphy + "'";
            });
            listPhy += ")";

            //logger.trace( "listPhy = %s", listPhy );

            var params2 = [idcust];

            var sql2 = "SELECT ";
            sql2 += "COALESCE( idcust, 0 ) sortkey, idphy, default_color, ";

            sql2 += "COALESCE( threshold_1, -1) t1, ";
            sql2 += "COALESCE( threshold_2, -1) t2, ";
            sql2 += "COALESCE( threshold_3, -1) t3, ";
            sql2 += "COALESCE( threshold_4, -1) t4, ";
            sql2 += "COALESCE( threshold_5, -1) t5, ";
            sql2 += "COALESCE( threshold_6, -1) t6, ";
            sql2 += "COALESCE( threshold_7, -1) t7, ";

            sql2 += "COALESCE( color_1, '-1' ) c1, ";
            sql2 += "COALESCE( color_2, '-1' ) c2, ";
            sql2 += "COALESCE( color_3, '-1' ) c3, ";
            sql2 += "COALESCE( color_4, '-1' ) c4, ";
            sql2 += "COALESCE( color_5, '-1' ) c5, ";
            sql2 += "COALESCE( color_6, '-1' ) c6, ";
            sql2 += "COALESCE( color_7, '-1' ) c7  ";

            sql2 += "FROM physical_threshold ";
            sql2 += "WHERE idphy in " + listPhy + " AND ( idcust = $1 OR idcust is NULL ) ";
            sql2 += "ORDER BY idphy asc, sortkey desc "; // idcust null (*) en dernier

            //logger.trace( "request : %s", sql2 );

            var query2 = client.query(sql2, params2);

            query2.on('error', function(error) {
                logger.trace("error on request : %s params =%j", sql2, params2);
                logger.error("ERROR : " + error.message);
                handleQueryError( done, callback );
            });

            var previous_idphy;

            query2.on('row', function(row, results) {

                //logger.trace( "%j", row );

                if ((previous_idphy == undefined) || (row.idphy != previous_idphy)) {

                    // injection des seuils existants pour ce polluant dans la réponse de la premiere requete
                    // mais seulement la premiere ligne c'est à dire que les seuils par défaut seront pris seulement en dernier
                    // s'il n'y a pas eu de seuil définis pour l'idcust du client

                    for( var i = 0 ; i < answer.length ; i++ )
                    {
                        if( answer[i].idphy == row.idphy )
                        {
                            // c'est la bonne grandeur physique
                            if(( row.t1 != -1 )&&( row.c1 != -1 )) { answer[i].thresholds.push( { below : row.t1, color : row.c1 } );}
                            if(( row.t2 != -1 )&&( row.c2 != -1 )) { answer[i].thresholds.push( { below : row.t2, color : row.c2 } );}
                            if(( row.t3 != -1 )&&( row.c3 != -1 )) { answer[i].thresholds.push( { below : row.t3, color : row.c3 } );}
                            if(( row.t4 != -1 )&&( row.c4 != -1 )) { answer[i].thresholds.push( { below : row.t4, color : row.c4 } );}
                            if(( row.t5 != -1 )&&( row.c5 != -1 )) { answer[i].thresholds.push( { below : row.t5, color : row.c5 } );}
                            if(( row.t6 != -1 )&&( row.c6 != -1 )) { answer[i].thresholds.push( { below : row.t6, color : row.c6 } );}
                            if(( row.t7 != -1 )&&( row.c7 != -1 )) { answer[i].thresholds.push( { below : row.t7, color : row.c7 } );}
                            answer[i].default_color = row.default_color;
                            break;
                        }
                    }
                    previous_idphy = row.idphy;
                }

                //results.addRow(row); // accumule les records dans l'objets result, cela permettra d'utiliser result.rows[] dans le gestionnaire de l'event 'end'
            });

            query2.on('end', function(result) {

                done();
                var user = userSettings.login + "-L" + userSettings.idlog + "C" + userSettings.idcust;
                logger.trace("api physicals for %s return %d row(s)", user, answer.length);
                callback( { physicals : answer }, 200 );
            });
        });
    });
};

module.exports.getTimezones = function(userSettings, callback) {

    //var idlog = userSettings.idlog;

    //logger.trace( "get timezones from db ...");

    // get a pg client from the connection pool
    pg.connect(connectionString, function(err, client, done) {

        // handle the error of connection
        if( isPgConnectionKO( err, done, callback )) { return; }

        // request ...

        var params = [];

        var sql = "SELECT idtz, * FROM timezone ORDER BY idtz";

        //logger.trace( "request : %s", sql );

        var query = client.query(sql, params);

        query.on('error', function(error) {
            logger.trace("error on request : %s params =%j", sql, params);
            logger.error("ERROR : " + error.message);
            handleQueryError( done, callback );
        });

        query.on('row', function(row, results) {
            //logger.trace( "%j", row );
            results.addRow(row); // accumule les records dans l'objets result, cela permettra d'utiliser result.rows[] dans le gestionnaire de l'event 'end'
        });

        query.on('end', function(result) {
            done();
            
            var user = userSettings.login + "-L" + userSettings.idlog + "C" + userSettings.idcust;
            logger.trace("api timezones for %s return %d row(s)", user, result.rows.length);
            callback( { timezones : result.rows }, 200 );
        });
    });
};

module.exports.getEquipmentModels = function(userSettings, callback) {

    //var idlog = userSettings.idlog;

    //logger.trace( "get equipment models from db ...");

    // get a pg client from the connection pool
    pg.connect(connectionString, function(err, client, done) {

        // handle the error of connection
        if( isPgConnectionKO( err, done, callback )) { return; }

        // request ...

        var params = [];

        var sql = "SELECT idmod, * FROM equipment_model ORDER BY idmod";

        //logger.trace( "request : %s", sql );

        var query = client.query(sql, params);

        query.on('error', function(error) {
            logger.trace("error on request : %s params =%j", sql, params);
            logger.error("ERROR : " + error.message);
            handleQueryError( done, callback );
        });

        query.on('row', function(row, results) {
            //logger.trace( "%j", row );
            results.addRow(row); // accumule les records dans l'objets result, cela permettra d'utiliser result.rows[] dans le gestionnaire de l'event 'end'
        });

        query.on('end', function(result) {
            done();
            
            var user = userSettings.login + "-L" + userSettings.idlog + "C" + userSettings.idcust;
            logger.trace("api equipment models for %s return %d row(s)", user, result.rows.length);
            callback( { equipment_models : result.rows }, 200 );
        });
    });
};

module.exports.getLanguages = function(userSettings, callback) {

    //var idlog = userSettings.idlog;

    //logger.trace( "get languages from db ...");

    // get a pg client from the connection pool
    pg.connect(connectionString, function(err, client, done) {

        // handle the error of connection
        if( isPgConnectionKO( err, done, callback )) { return; }

        // request ...

        var params = [];

        var sql = "SELECT idlng , * FROM language where enabled = 1 ORDER BY idlng";

        //logger.trace( "request : %s", sql );

        var query = client.query(sql, params);

        query.on('error', function(error) {
            logger.trace("error on request : %s params =%j", sql, params);
            logger.error("ERROR : " + error.message);
            handleQueryError( done, callback );
        });

        query.on('row', function(row, results) {
            //logger.trace( "%j", row );
            results.addRow(row); // accumule les records dans l'objets result, cela permettra d'utiliser result.rows[] dans le gestionnaire de l'event 'end'
        });

        query.on('end', function(result) {
            done();
            
            var user = userSettings.login + "-L" + userSettings.idlog + "C" + userSettings.idcust;
            logger.trace("api languages for %s return %d row(s)", user, result.rows.length);
            callback( { languages : result.rows }, 200 );
        });
    });
};

module.exports.getSites = function(userSettings, callback) {

    //var idlog = userSettings.idlog;
    var idcust = userSettings.idcust;

    //logger.trace( "get sites from db ...");

    // get a pg client from the connection pool
    pg.connect(connectionString, function(err, client, done) {

        // handle the error of connection
        if( isPgConnectionKO( err, done, callback )) { return; }

        // request ...

        var params = [idcust];

        var sql = "SELECT DISTINCT "; // sinon il y a 1 ligne par cairnet + les lignes des cairsens
        sql += "s.idsite , s.* ";
        sql += "FROM site s ";
        sql += "INNER JOIN equipment_assignment ea ON ea.idsite = s.idsite ";
        sql += "WHERE ";
        sql += "COALESCE( ea.status, 0 ) >= 2 ";
        sql += "AND ea.idcust = $1 ";
        sql += "ORDER BY s.idsite asc ";

        // nombre de mesures par site 
        // sql += "( select ea.idsite, count(m.idmeas) nbmeas ";
        // sql += "from measure m, equipment_assignment ea where ea.idass = m.idass AND COALESCE( ea.status, 0 ) >= 2 AND ea.idcust = $1 group by ea.idsite ";
        // sql += ") cm, "

        // date max de la derniere donnée fla par site
        // sql += "( select ea.idsite, to_char( max(m.lastdatefla), 'yyyy/mm/dd hh24:mi:ss') maxdatez ";
        // sql += "from measure m, equipment_assignment ea where ea.idass = m.idass AND COALESCE( ea.status, 0 ) >= 2 AND ea.idcust = $1 group by ea.idsite ";
        // sql += ") md "

        //logger.trace( "request : %s", sql );

        var query = client.query(sql, params);

        query.on('error', function(error) {
            logger.trace("error on request : %s params =%j", sql, params);
            logger.error("ERROR : " + error.message);
            handleQueryError( done, callback );
        });

        query.on('row', function(row, results) {
            //logger.trace( "%j", row );
            results.addRow(row); // accumule les records dans l'objets result, cela permettra d'utiliser result.rows[] dans le gestionnaire de l'event 'end'
        });

        query.on('end', function(result) {
            done();
            
            var user = userSettings.login + "-L" + userSettings.idlog + "C" + userSettings.idcust;
            logger.trace("api sites for %s return %d row(s)", user, result.rows.length);
            callback( { sites : result.rows }, 200 );
        });
    });
};

module.exports.getMeasures = function(userSettings, callback) {

    var idlog = userSettings.idlog;
    var idcust = userSettings.idcust;

    //logger.trace( "get measures from db for idlog =%d ...", idlog );

    // get a pg client from the connection pool
    pg.connect(connectionString, function(err, client, done) {

        // handle the error of connection
        if( isPgConnectionKO( err, done, callback )) { return; }

        // request ...

        var params = [idcust];

        var sql = "SELECT ";

        // identification de la mesure
        sql += "s.idsite, m.idmeas, m.tag tagmeas, COALESCE( m.fmul, -2 ) fmul, ";

        // unité et grandeur
        sql += "u.symbol unit, u.tag tagunit, p.type, p.tagtype, p.cchim cchim, p.tagcode tagcode ";

        sql += "FROM site s ";
        sql += "INNER JOIN equipment_assignment ea ON ea.idsite = s.idsite ";
        sql += "INNER JOIN measure m ON m.idass = ea.idass ";
        sql += "INNER JOIN physical p ON p.idphy = m.idphy ";
        sql += "INNER JOIN unit u ON u.idunit = m.idunit ";

        sql += "WHERE COALESCE( ea.status, 0 ) >= 2 AND ea.idcust = $1 ";
        sql += "ORDER BY s.idsite, m.idmeas asc ";

        //logger.trace( "request : %s", sql );

        var query = client.query(sql, params);

        query.on('error', function(error) {
            logger.trace("error on request : %s params =%j", sql, params);
            logger.error("ERROR : " + error.message);
            handleQueryError( done, callback );
        });

        query.on('row', function(row, results) {
            //logger.trace( "%j", row );
            results.addRow(row); // accumule les records dans l'objets result, cela permettra d'utiliser result.rows[] dans le gestionnaire de l'event 'end'
        });

        query.on('end', function(result) {

            done();
            var user = userSettings.login + "-L" + userSettings.idlog + "C" + userSettings.idcust;
            logger.trace("api measures for %s return %d row(s)", user, result.rows.length);
            callback( { measures : result.rows }, 200 );
        });
    });
};

module.exports.getLastFla = function(userSettings, callback) {

    //var idlog = userSettings.idlog;
    var idcust = userSettings.idcust;

    //logger.trace( "get lastfla from db for idlog =%d ...", idlog );

    // get a pg client from the connection pool
    pg.connect(connectionString, function(err, client, done) {

        // handle the error of connection
        if( isPgConnectionKO( err, done, callback )) { return; }

        // request ...

        var params = [idcust];

        // on recupere la derniere donnée de chaque mesure

        var sql = "SELECT ";

        // info du site + timezone du site
        sql += "s.idsite, s.tagsite, s.timezone tzsite, ";
        // coordonnées du site (toutes les mesures ont par défaut les coordonnées du site )
        sql += "latitude lat, longitude long, altitude alt, tagloc, ";
        // identification de la mesure + periode
        sql += "m.idmeas, m.tag tagmeas, COALESCE( m.fmul, -2 ) fmul, a.period, ";
        // unité et grandeur
        sql += "u.symbol unit, p.idphy idphy, p.cchim cchim, ";
        // valeur / qc / date UTC
        sql += "d.value, d.qc, extract(epoch from d.date) epoch ";

        sql += "FROM equipment_assignment ea ";
        sql += "INNER JOIN site s ON s.idsite = ea.idsite ";
        sql += "INNER JOIN measure m ON m.idass = ea.idass ";
        sql += "INNER JOIN physical p ON p.idphy = m.idphy ";
        sql += "INNER JOIN unit u ON u.idunit = m.idunit ";
        sql += "INNER JOIN aggreg a ON ( a.idmeas = m.idmeas AND a.kind = 'FLA' ) "; // donnée fla seulement
        
        // récupération éventuelle de la lastdate
        sql += "LEFT OUTER JOIN aggreg_v av ON av.idaggr = a.idaggr ";
        // récupération éventuelle de seulement la derniere donnée (dont la date est mémorisée dans average_v.lastdate )
        sql += "LEFT OUTER JOIN datafla d ON ( d.idmeas = m.idmeas AND d.date = av.lastdate AND av.lastdate is not NULL ) ";

        // seulement pour les équipements installés de ce client
        sql += "WHERE COALESCE( ea.status, 0 ) >= 2 AND ea.idcust = $1 ";

        sql += "ORDER BY s.idsite, m.idmeas asc ";

        //logger.trace( "request : %s", sql );

        var query = client.query(sql, params);

        query.on('error', function(error) {
            logger.trace("error on request : %s params =%j", sql, params);
            logger.error("ERROR : " + error.message);
            handleQueryError( done, callback );
        });

        query.on('row', function(row, results) {
            //logger.trace( "%j", row );

            // arrondi a une valeur entiere
            row.value = util.round(row.value);

            results.addRow(row); // accumule les records dans l'objets result, cela permettra d'utiliser result.rows[] dans le gestionnaire de l'event 'end'
        });

        query.on('end', function(result) {

            done();
            var user = userSettings.login + "-L" + userSettings.idlog + "C" + userSettings.idcust;
            logger.trace("api lastfla for %s return %d row(s)", user, result.rows.length);
            callback( { lastfla : result.rows }, 200 );
        });
    });
};

module.exports.getEquipmentFla = function(userSettings, callback) {

    //var idlog = userSettings.idlog;
    var idcust = userSettings.idcust;

    //logger.trace("get equipmentfla from db for idlog =%d ...", idlog );

    // get a pg client from the connection pool
    pg.connect(connectionString, function(err, client, done) {

        // handle the error of connection
        if( isPgConnectionKO( err, done, callback )) { return; }

        // request ...

        var params = [idcust];

        var sql = "SELECT ";

        // on crée une clé de trie synthetique avec l'idsite et l'idass du parent s'il y en a un
        // comme cela 
        // pour le 1er  site, on aura le cairnet, puis ses cairsens ....
        // puis le 2eme site, on aura le cairnet, puis ses cairsens ....
        // que l'idsite doit défini ou soit null

        sql += "lpad( format( '%s', COALESCE( ea.parent, ea.idass )), 6, '0')||'-'||";
        sql += "lpad( format( '%s', COALESCE( ea.parent, 0        )), 6, '0')||'-'||";
        sql += "lpad( format( '%s', ea.idsite ), 6, '9')  sortkey, ";

        // info du site
        sql += "s.idsite, s.tagsite, s.tagloc, s.timezone tzsite, ";

        // coordonnées du site
        //sql +=  "s.latitude, s.longitude, s.altitude, ";

        // reference de l'equipement et model
        sql += "ea.serial_number, ea.idass, em.type, em.model, em.imageid, ";
        
        // etat d'alerte de l'equipement et usure (du cairsens)
        sql += "eav.alert_state, eav.used_pct, ";

        // info sur la mesure
        sql += "m.idmeas, m.tag, u.symbol, p.idphy, p.cchim, p.type ptype, ";
        
        // info sur le niveau de moyenne fla
        sql += "a.idaggr, a.alert_level, a.alert_duration, a.period, av.lastdate, ";

        // valeur / qc / date UTC
        sql += "d.value, d.qc, extract(epoch from d.date) epoch ";

        sql += "FROM equipment_assignment ea ";
        sql += "INNER JOIN equipment_model em ON em.idmod = ea.idmod ";
        sql += "LEFT OUTER JOIN equipment_assignment_v eav ON eav.idass = ea.idass ";
        sql += "LEFT OUTER JOIN site s ON s.idsite = ea.idsite ";
        sql += "LEFT OUTER JOIN measure m ON m.idass = ea.idass ";
        sql += "LEFT OUTER JOIN physical p ON p.idphy = m.idphy ";
        sql += "LEFT OUTER JOIN unit u ON u.idunit = m.idunit ";
        sql += "LEFT OUTER JOIN aggreg a ON ( a.idmeas = m.idmeas AND a.kind = 'FLA' ) "; // donnée fla seulement
        
        // récupération éventuelle de la lastdate
        sql += "LEFT OUTER JOIN aggreg_v av ON av.idaggr = a.idaggr ";
        // récupération éventuelle de seulement la derniere donnée (dont la date est mémorisée dans average_v.lastdate )
        sql += "LEFT OUTER JOIN datafla d ON ( d.idmeas = m.idmeas AND d.date = av.lastdate AND av.lastdate is not NULL ) ";

        sql += "WHERE COALESCE( ea.status, 0 ) >= 2 AND ea.idcust = $1 ";
        sql += "ORDER BY sortkey asc, idass asc, p.idphy desc ";

        //logger.trace("request : %s", sql);

        var query = client.query(sql, params);

        query.on('error', function(error) {
            logger.trace("error on request : %s params =%j", sql, params);
            logger.error("ERROR : " + error.message);
            handleQueryError( done, callback );
        });

        query.on('row', function(row, results) {
            //logger.trace( "%j", row );
            results.addRow(row); // accumule les records dans l'objets result, cela permettra d'utiliser result.rows[] dans le gestionnaire de l'event 'end'
        });

        query.on('end', function(result) {

            // mise en forme

            var answer = [];

            var ref_cairnet; // reference
            var ref_cairsens; // reference
            var ref_cairsen; // reference

            function addCairnet(item) {

                answer.push({

                    //expanded : false, // pour l'ihm extJS
                    idass: item.idass,
                    idsite: item.idsite,
                    tagsite: item.tagsite,
                    tagloc: item.tagloc,
                    type: item.type,
                    model: item.model,
                    alert_state: item.alert_state,
                    iconCls: item.type + "_" + item.imageid,
                    serial_number: item.serial_number,
                    children: [] // on prevoit un tableau vide
                });

                ref_cairnet = answer[answer.length - 1]; // on sauvegarde la référence sur ce cairnet
                ref_cairsens = answer[answer.length - 1].children; // on sauvegarde la référence sur ce tableau de cairsens
            }

            function addCairsens(item) {

                ref_cairsens.push({

                    leaf: true, // pour l'ihm extJS
                    idass: item.idass,
                    type: item.type,
                    model: item.model,
                    iconCls: item.type + "_" + item.imageid,
                    serial_number: item.serial_number,
                    used_pct: item.used_pct
                });

                ref_cairsen = ref_cairsens[ref_cairsens.length - 1]; // on sauvegarde la référence sur ce cairsens
            }

            function addCairnetValue(item) {

                /*
                if( item.symbol == null )
                {
                    // la ligne ne contient de valeur pour une mesure
                    return;
                }
                
                ref_cairnet[item.cchim + "_unit"] = item.symbol;
                ref_cairnet[item.cchim + "_value"] = util.round(item.value); // arrondi a une valeur entiere

                if( item.cchim == 'BC' )
                {
                    // c'est la batterie du cairnet
		            ref_cairnet["epoch"] = item.epoch;
                }
                */
            }

            function addCairsensValue(item) {

                if( item.ptype == null )
                {
                    // la ligne ne contient de valeur pour une mesure
                    return;
                }

                if( item.ptype == 1 ) { // 1=polluant, 2=méteo, 3=technique

                    // c'est le(s) polluant(s) du cairsens (il sont trié par idphy décroissant donc le PM2.5 puis le PM10 qui écrase la valeur du PM2.5 )

                    ref_cairsen["idmeas"] = item.idmeas;
                    ref_cairsen["idaggr"] = item.idaggr;
                    ref_cairsen["idphy"] = item.idphy;
                    ref_cairsen["cchim"] = item.cchim;
                    ref_cairsen["unit"] = item.symbol;
                    ref_cairsen["value"] = util.round(item.value); // arrondi a une valeur entiere
                    ref_cairsen["alert_state"] = item.alert_state,
                    ref_cairsen["alert_level"] = item.alert_level;
                    ref_cairsen["alert_duration"] = item.alert_duration;
                    ref_cairsen["epoch"] = item.epoch;
                }
                else
                {
                    //ref_cairsen[item.cchim + "_unit"] = item.symbol;
                    //ref_cairsen[item.cchim + "_value"] = util.round(item.value); // arrondi a une valeur entiere
                }
            }

            var previous_row;

            result.rows.forEach(function(item, index, array) {

                // on structure les résultats (notez bien que l'ordre de tri de la requete est primordiale)

                if( previous_row == undefined )
                {
                    // la reponse est vide pour le moment
                    if( item.type == 'Cairnet')
                    {
                        // la premiere ligne selon la config doit etre un Cairnet
                        addCairnet(item);
                        addCairnetValue(item);

                        // save the previous row
                        previous_row = item;
                    }
                    else
                    {
                        // alors il y a une erreur dans la base et on ne tiens pas compte de cette ligne
                    }
                }
                else
                {
                    if( item.idass == previous_row.idass )
                    {
                        // la ligne concerne le même equipement que la ligne précédente (cairnet ou cairsens)
                        if( item.type == 'Cairnet')
                        {
                            addCairnetValue(item);
                        }
                        else
                        {
                            addCairsensValue(item);
                        }
                    }
                    else
                    {
                        // c'est un equipement différent
                        if( item.type == 'Cairnet')
                        {
                            addCairnet(item);
                            addCairnetValue(item);
                        }
                        else
                        {
                            addCairsens(item);
                            addCairsensValue(item);
                        }
                    }

                    // save the previous row
                    previous_row = item;
                }
            });

            done();
            var user = userSettings.login + "-L" + userSettings.idlog + "C" + userSettings.idcust;
            logger.trace("api equipmentfla for %s return %d row(s)", user, result.rows.length);

            callback( { children : answer }, 200 );
        });
    });
};

module.exports.getHistoData = function(userSettings, idaggrs, start, end, callback) {

    var idcust = userSettings.idcust;
    var tzdisplay = userSettings.tzdisplay;
    var user = userSettings.login + "-L" + userSettings.idlog + "C" + userSettings.idcust;

    logger.trace("get histodata for %s idaggrs <%s> start <%s> end <%s> ...", user, idaggrs, start, end);

    //10.205.226.179:3000/api/histodata?idaggrs=1819,1820,1821,1822,1827,1828,1829,1830,1879,1880,1881,1882&start=1478390400&end=1478394000

    // ---------------------------------
    // contrôle des paramêtres en entrée
    // ---------------------------------

    var idaggrTab = [];

    if( idaggrs == undefined ) {
        logger.warn("get histodata : invalid parameter(s) : missing idaggrs list");
        callback({}, 400);
        return;
    }
    else {
        // liste des mesures /histodata?idaggrs=1819,1820,1821,1822...
        idaggrTab = idaggrs.split(',');

        if( idaggrTab.length == 0 ) {
            logger.warn("get histodata : invalid parameter(s) : idaggrs list is empty");
            callback({}, 400);
            return;
        }

        idaggrTab.forEach(function(item, index, array) {
            if (isNaN(item)) {
                logger.warn("get histodata : invalid parameter(s) : idaggrs list content is invalid");
                callback({}, 400);
                return;
            }
        });
    }

    // --------------------------------------
    // interpretation des bornes start et end
    // --------------------------------------

    // date peut être soit un nombre epoch soit une chaine 'YYYY/MM/DD HH:mm:ss' dans le fuseau d'affichage du user authentifié
    function convertDateInput( date, tzdisplay ) {
        
        var epoch;

        if( date != undefined ) {

            //logger.trace("%s : NaN = %d (length : %d)", date, isNaN(date), date.length);

            if (!isNaN(date)) {
                // est un nombre 
                epoch = date;
            }
            else {
                if (date.length == 19) {
                    // c'est une chaine de date
                    var dateTZ = moment.tz(date, 'YYYY/MM/DD HH:mm:ss', tzdisplay);
                    epoch = dateTZ.valueOf() / 1000;
                }
            }
        }
        return epoch;
    }

    var epochS = convertDateInput(start, tzdisplay);

    if (isNaN(epochS)) {
        // les parametres sont invalides
        logger.warn("get histodata : invalid parameter(s) : start date");
        callback({}, 400); // then send a empty json
        return;
    }
    else {
        // epochS valide
        var epochE = convertDateInput(end, tzdisplay);

        if (epochE < epochS) {
            // la date de fin est plus petit que la date de debut
            logger.warn("get histodata : invalid parameter(s) : end date < start date");
            callback({}, 400); // then send a empty json
            return;
        }
    }

    // parametre d'entrée
    // logger.trace("epochS = %d", epochS);
    // logger.trace("epochE = %d", epochE);
    // logger.trace("idaggrTab = %j", idaggrTab);

    // variables pour le chronometrage du temps d'execution
    var timestart = new Date();

    var checkScope = function( client, done, cb ) { // param 1, param 2 ..., cb 

        var request = "SELECT ";

        // on recupere l'idmeas, le descriptif de la periode, le type de l'aggreg (et le fmul pour l'affichage)
        request += "a.idmeas, a.idaggr, a.kind, a.period, a.period_u, COALESCE( m.fmul, -2 ) fmul, COALESCE( s.timezone, 'UTC' ) timezone ";
        request += "FROM equipment_assignment ea ";
        request += "INNER JOIN site s ON s.idsite = ea.idsite ";
        request += "INNER JOIN measure m ON m.idass = ea.idass ";
        request += "INNER JOIN aggreg a ON a.idmeas = m.idmeas ";
        request += "WHERE ";

        // seulement les mesures de ce client
        request += "COALESCE( ea.status, 0 ) >= 2 AND ea.idcust = $1 ";

        // seulement pour les niveaux d'aggregations demandées
        request += "AND a.idaggr = ANY ($2) ";
        request += "ORDER BY a.idaggr ";

        //logger.trace("request : %s", request);

        var params = [ idcust, idaggrTab ]; // idaggrTab est un tableau

        var query = client.query(request, params);

        query.on('error', function(err) {
            
            err['request'] = request; // on sauvegarde le texte de la requete
            return cb( err, client, done ); // erreur, parametre 1, parametre2
        });

        query.on('row', function(row, results) {
            results.addRow(row); // accumule les records dans l'objets result, cela permettra d'utiliser result.rows[] dans le gestionnaire de l'event 'end'
        });

        query.on('end', function(result) {

            if( result.rows.length == 0 ) {
                // aucun des idaggrs demandés fait partie du scope de ce client
                logger.warn("securityCheck FAIL these idaggrs are not within the customer scope !");
                var err = {};
                err['message'] = "forbidden idaggrs list";
                return cb( err, client, done, 403 ); // erreur, parametre 1, parametre2
            }
            
            var idaggrs = result.rows;

            //logger.trace("securityCheck OK idmeas = %j", result.rows);
            // on passe a la methode suivante ou a la gestion d'erreur
            return cb( null, client, done, idaggrs ); // erreur, parametre 1, parametre2
        });
    };

    var splittingType = function(client, done, idaggrs, cb ) { // param 1, param 2 ..., cb

        // on separe les idaggrs en 2 tas (1 pour les FLAs, 1 pour les SLAs)

        var infosM = {}; // contiendra les infos pour 1 idmeas donné (celui de la FLA)
        var infosA = {}; // contiendra les infos pour 1 idaggr donné (FLA & SLA)
        var flas = [];  // contiendra des idmeas pour les FLAs
        var slas = [];  // contiendra des idaggr pour les SLAs
        
        idaggrs.forEach( function( item, index, array ) {

            if( item.kind == 'FLA') {
                flas.push( item.idmeas );
                infosM[ item.idmeas ] = item;
            }
            else if( item.kind == 'SLA') {
                slas.push( item.idaggr );
            }
            infosA[ item.idaggr ] = item;
        });
        
        //console.log( "flas : %d", flas.length );
        //console.log( "slas : %d", slas.length );

        return cb( null, client, done, infosM, infosA, flas, slas ); // erreur, parametre 1, parametre2
    };
    
    var launchDataRead = function(client, done, infosM, infosA, flas, slas, cb ) { // param 1, param 2 ..., cb

        var fdatas = {};
        var sdatas = {};
        
        var getFlas = function( cb ) {
            
            //console.log( "getFlas() %j", flas );
            
            var request = "SELECT idmeas, value, qc, extract(epoch from date) datez FROM datafla ";
            request += "WHERE idmeas = ANY ($1) ";
            // seulement sur un interval donné ] epochS - epochE ]
            request += "AND date >  to_timestamp(" + epochS + ") at time zone 'UTC' ";  
            request += "AND date <= to_timestamp(" + epochE + ") at time zone 'UTC' "; 
            request += "ORDER BY idmeas asc, datez asc ";
            
            var params = [flas]; // flas est un tableau
            
            var query = client.query(request, params);
    
            query.on('error', function(err) {
                err['request'] = request; // on sauvegarde le texte de la requete
                return cb( err ); // erreur, parametre 1, parametre2
            });
    
            query.on('row', function(row, results) {
                
                // on récupère l'idaggr associé a cet idmeas
                var idaggr = infosM[ row.idmeas ].idaggr;

                // on range les données dans une propriété de l'objet fdatas
                if( fdatas[ idaggr  ] === undefined )
                {
                    fdatas[ idaggr  ] = [];
                }
                
               fdatas[ idaggr  ].push({
                    v: row.value,
                    q: row.qc,
                    t: row.datez,
                });
            });
    
            query.on('end', function(result) {
                cb( null, fdatas );
            });            
        };
        
        var getSlas = function( cb ) {
            
            //console.log( "getSlas() %j", slas );
            
            var request = "SELECT idaggr, value, qc, extract(epoch from date) datez FROM datasla ";
            request += "WHERE idaggr = ANY ($1) ";
            // seulement sur un interval donné ] epochS - epochE ]
            request += "AND date >  to_timestamp(" + epochS + ") at time zone 'UTC' ";  
            request += "AND date <= to_timestamp(" + epochE + ") at time zone 'UTC' "; 
            request += "ORDER BY idaggr asc, datez asc ";            
            
            var params = [slas]; // slas est un tableau
            
            var query = client.query(request, params);
    
            query.on('error', function(err) {
                err['request'] = request; // on sauvegarde le texte de la requete
                return cb( err ); // erreur, parametre 1, parametre2
            });

            query.on('row', function(row, results) {
                
                if( sdatas[ row.idaggr  ] === undefined )
                {
                    sdatas[ row.idaggr  ] = [];
                }
                sdatas[ row.idaggr ].push({
                    v: row.value,
                    q: row.qc,
                    t: row.datez,
                });
            });

            query.on('end', function( result ) {
                cb( null, sdatas );
            });               
        };
        
        var asyncTasks = [];
        
        if( flas.length > 0 ) { asyncTasks.push( getFlas ); }
        if( slas.length > 0 ) { asyncTasks.push( getSlas ); }
        
        aSync.parallel( asyncTasks, function( err, results ) { // results is a ordered array [ resultA, resultB ] whenever B finish first or last
        
            // All tasks are done now or an error occured
            return cb( err, client, done, infosA, results ); // erreur, parametre 1, parametre2
        });
    };    
    
    var formatting = function( client, done, infosA, results, cb ) { // param 1, param 2 ..., cb

        var merged = {};
        
        // results est un tableau d'objet
        results.forEach(function(item, index, array) {
        
            // copie dans merged le propriété de item ( qui sont des idaggr )
            _.extend( merged, item );
        });        
        
        var answer = { "histodata" : [] };

        var totalcount = 0;
        // on assemble la réponse en ajoutant des infos pour chaque niveau d'aggreg
        for( var idaggr in merged ) {
          
          answer.histodata.push({
                
                idmeas : infosA [ idaggr ].idmeas,
                timezone : infosA [ idaggr ].timezone,
                idaggr : infosA [ idaggr ].idaggr,
                kind : infosA [ idaggr ].kind,
                fmul : infosA [ idaggr ].fmul,
                period : infosA [ idaggr ].period,
                period_u : infosA [ idaggr ].period_u, 
                datas : merged[ idaggr ]
            });
            
            totalcount +=  merged[ idaggr ].length;
        }

        var totaltime = new Date() - timestart;

        logger.trace("get histodata for %s totaltime =%d totalcount =%d", user, totaltime, totalcount);

        return cb( null, client, done, 200, answer ); // erreur, parametre 1, parametre2
    };    
    
    aSync.waterfall(
        [
            connect,
            checkScope,
            splittingType,
            launchDataRead,
            formatting
        ],
        function( err, client, done, httpcode, answer ) {

            if (client) {
                // release the connection
                done();
            }

            if( err ) {

                logger.error("in waterfall happen an error !");

                if (err.request) {
                    logger.error("request <%s>", err.request);
                }
                if (err.message) {
                    logger.error("message <%s>", err.message);
                }
                if (httpcode) {
                    callback(answer, httpcode);
                }
                else {
                    callback(answer, 500);
                }
            }
            else
            {
                callback(answer, httpcode);
            }
        }
    );
};

module.exports.getChartAggreg = function(userSettings, callback) {

    var idcust = userSettings.idcust;
    var user = userSettings.login + "-L" + userSettings.idlog + "C" + userSettings.idcust;

    //logger.trace("get chartaggreg for %s ...", user );

    // get a pg client from the connection pool
    pg.connect(connectionString, function(err, client, done) {

        // handle the error of connection
        if( isPgConnectionKO( err, done, callback )) { return; }

        // request ...

        var params = [idcust];

        var sql = "SELECT ";

        // info du site
        sql += "s.idsite, s.tagsite, ";

        // info sur la mesure
        sql += "m.idmeas, m.tag tagmeas, ";

        // info sur le niveau d'aggrégation
        sql += "a.idaggr, a.period, a.period_u, a.kind, a.type aggrtype, ";

        // info sur la grandeur physique (type et code chimique)
        sql += "p.idphy, p.cchim, p.tagcode, p.type phytype, ";
        
        // info sur l'unite
        sql += "u.symbol, ";
        
        // synthetisation de la periode théorique des type de donnée pour le trie uniquement
        sql += " (CASE ";
        sql += " WHEN a.period_u = 's' THEN (a.period) ";
        sql += " WHEN a.period_u = 'D' THEN (a.period * 86400) ";
        sql += " ELSE (a.period) END) AS theorical_period "; 

        sql += "FROM equipment_assignment ea ";
        sql += "INNER JOIN site s ON s.idsite = ea.idsite ";
        sql += "INNER JOIN measure m ON m.idass = ea.idass ";
        sql += "INNER JOIN physical p ON p.idphy = m.idphy ";
        sql += "INNER JOIN unit u ON u.idunit = m.idunit ";
        sql += "INNER JOIN aggreg a ON a.idmeas = m.idmeas "; // donnée FLA et SLA
        sql += "INNER JOIN aggreg_v av ON ( av.idaggr = a.idaggr )";

        sql += "AND av.lastdate IS NOT NULL "; // seulement les mesures qui ont des données
        sql += "WHERE COALESCE( ea.status, 0 ) >= 2 AND ea.idcust = $1 ";
        sql += "AND s.idsite IS NOT NULL ";
        sql += "AND m.idmeas IS NOT NULL ";

        sql += "ORDER BY theorical_period, s.idsite, m.idmeas ";

        //logger.trace("request : %s", sql);

        var query = client.query(sql, params);

        query.on('error', function(error) {
            logger.trace("error on request : %s params =%j", sql, params);
            logger.error("ERROR : " + error.message);
            handleQueryError( done, callback );
        });

        query.on('row', function(row, results) {
            //logger.trace( "%j", row );
            delete row['theorical_period'];
            results.addRow(row); // accumule les records dans l'objets result, cela permettra d'utiliser result.rows[] dans le gestionnaire de l'event 'end'
        });

        query.on('end', function(result) {

            done();
            var user = userSettings.login + "-L" + userSettings.idlog + "C" + userSettings.idcust;
            logger.trace("api chartaggreg for %s return %d row(s)", user, result.rows.length);
            callback( { chartaggreg : result.rows }, 200 );
        });
    });
};

