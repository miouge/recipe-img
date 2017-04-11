
var logger = require("../logger")(); // logger iséo

var pg = require('pg');
var util = require("util");
var fs = require("fs");
var moment  = require('moment');
var momentz = require('moment-timezone');
var bcrypt = require('bcrypt-nodejs');
var countryLanguage = require('country-language');

var db_global = require('./db_global');

// var connectionString  = db_global.getConnectionString();
// var isPgConnectionKO  = db_global.isPgConnectionKO;
// var handleQueryError  = db_global.handleQueryError;
// var parseReqRecord    = db_global.parseReqRecord;
 var toSqlInsertString = db_global.toSqlInsertString;
// var toSqlUpdateString = db_global.toSqlUpdateString;
// var removeRecordField = db_global.removeRecordField;


//pool is created on first call to pg.connect
pg.defaults.poolSize = 10;

//---------------------------------------- TOOLS --------------------------------------------

/*
    // appel d'un nom de fontion dynamique avec EVAL
    
    try
    {
        // appel de la fonction fillTable_<tablename>( client ) si elle existe dans le source
        eval( 'fillTable_' + t + '( client )' );
    }
    catch( err )
    {
        logger.trace( "fillTable " + t + " : exception = " + err );
    }
*/

function myRandomI( low, high ) {
    // generate a pseudo random integer number beetween [ low - high [
    
    return Math.floor( Math.random() * (high - low) + low );
}

function myRandomF( low, high ) {
    // generate a pseudo random integer number beetween [ low - high [
    
    return Math.random() * (high - low) + low;
}

function padZeros( number, digitnb ) {
    // formatte un nombre en chaine sur un nombre de fixe de digit en rajoutant des zeros a gauche si necessaire
    // 2015-04-17 pri creation
    
    var numberStr = number.toString();          // On initialise la valeur à renvoyer en chaîne de caractères
    var numZeros = digitnb - numberStr.length;  // On calcule le nombre de zéros a (eventuellement) ajouter
    for( var i = 0 ; i < numZeros ; i++ )
    {
        numberStr = "0" + numberStr;
    }
    return numberStr;
}

//-------------------------------------------------------------------------------------------

function getRandomQC( previousQC ) {
      
    var qc = [ "A"
            ,"R"
            ,"O"
            ,"P"
            ,"D"
            ,"I"
            ,"M"
            ,"Z"
            ,"C"
            ,"N"
            ,"W"
            ,"B"
            ,"X"
            ,"S"
            ,"G"
            ,"H"
            ,"g" ];
    
    var proba = myRandomF( 0, 100 );
    
    if(( previousQC == undefined )||( previousQC == 'A'))
    {
        if( proba < 3 )
        {
            // 5% de donnée non "A"
            var selected = myRandomI( 0 , qc.length );
            return qc[ selected ];
        }
        else
        {
            return qc[ 0 ]; // A
        }
    }
    else
    {
        if( proba < 80 )
        {
            return previousQC; // pas de changement
        }
        else
        {
            return qc[ 0 ]; // A
        }
    }
}

function getNewValue( previousV , previousQC ) {
    var obj = { "value" : 0.0, "qc" : 'N' };
    
    obj.qc = getRandomQC( previousQC );
    
    if( previousV == undefined )
    {
        obj.value = myRandomI( 1, 50+1 ); // valeur principale
    }
    else
    {
        obj.value = previousV * myRandomF( 0.95, 1.051 ); // variation vis a vis de la valeur précédente
    }

    return obj;
}

//-------------------------------------------------------------------------------------------

function tableBase() {
    // public property
    this.name; // not initialized by now
    this.desc; // not initialized by now
    this.index = []; // (liste des champs pour lesquels on devra creer un index)

    // public method
    this.load = function( client )
    {
    };
}

tableBase.prototype.drop = function( client ) {
    
    var query = client.query( "drop table if exists public." + this.name + " cascade");
    
    var me = this;
    
    query.on( 'error', function( error ) {
        logger.trace( "table %s drop : ERROR ! (%s)", me.name, error.message );
    });

    query.on('end', function() {
        logger.trace( "table %s drop complete", me.name ); 
    });
};

tableBase.prototype.create = function( client ) {
    
    var query = client.query( "create table if not exists " + this.name + "(" + this.desc + ") TABLESPACE cloud");
    
    var me = this;
    
    query.on( 'error', function( error ) {
        logger.trace( "table %s create : ERROR ! (%s)", me.name, error.message );
        logger.trace( "request : %s", query.text );
    });
    
    query.on('end', function() {
        logger.trace( "table %s create complete", me.name ); 
    });
    
    // creation éventuelle des index
    // note : un index est deja systematiquement créer sur les clé primaire
    
    me.index.forEach( function( item, index, array ) {
        
        var params = [];
        
        var request = "CREATE INDEX " + me.name + "_" + item + "_index ON " + me.name + "( " + item + " )";
        
        //logger.trace( 'request = %s', request )
        
        var query2 = client.query( request, params, function( err ) {
            if( err )
            {
                logger.trace( "request %s : ERROR (%s)", request, err.message );  // dans ce cas (erreur) il y aura pas l' end-event
            }
            else
            {
                logger.trace( "request %s : OK", request );
            }
        });
    });    
};

tableBase.prototype.populate  = function( client, tables, index )  {

    index++;
    if( index < tables.length )
    {
        // appel la fonction populate() de l'objet suivant du tableau
        logger.trace( "table "+ this.name + " call table " + tables[index].name + " .populate() ...");
        tables[index].populate( client, tables, index );
    }
    else
    {
        // fin du tableau atteinte : sortie de l'exploration récursive
    }
};

//--------------------------------------------------------------------------------------------
function tableLanguage() {
    tableBase.apply( this, arguments ); // initialize parent object's members
    
    this.init = function()
    {
        this.name = "language";
        
        this.desc = "idlng SMALLSERIAL PRIMARY KEY";
        this.desc += ", iso639_1 VARCHAR(2)"; // code a 2 lettre
        this.desc += ", iso639_2 VARCHAR(3)";
        this.desc += ", iso639_3 VARCHAR(3)";
        this.desc += ", local_name TEXT";
        this.desc += ", english_name TEXT";
        this.desc += ", enabled SMALLINT";
    };
    
    this.load = function( client ) // override of the method of the base object
    {
        // chargement a partir du npm country-language

        var allLanguages = countryLanguage.getLanguages();

        allLanguages.forEach( function( item, index ) {
        
            // insertion en bdd
            
            // De nombreuses langues ou familles de langues n'ont pas de code à deux lettres,
            // mais uniquement à trois lettres (voir ISO 639). Certaines entrées (arabe, chinois, quechua…) sont définies dans l'ISO 639-3 comme des macrolangues
            // iso639_1: language iso639-1 code (2 letters)
            // iso639_2: language iso639-2 code (3 letters)
            // iso639_2en: language iso639-2 code with some codes derived from English names rather than native names of languages (3 letters)
            // iso639_3: language iso639-3 code (3 letters)
            // name: String array with one or more language names (in English)
            // nativeName: String array with one or more language names (in native language)
            // direction: Language script direction (either 'LTR' or 'RTL') - Left-to-Right, Right-to-Left
            // family: language family
            // countries: Array of country objects where this language is spoken
            
            if(( item.iso639_1.length <= 2 ) && ( item.iso639_2.length <= 3 ) && ( item.iso639_3.length <= 3 ))
            {
                var params = [ item.iso639_1, item.iso639_2, item.iso639_3, item.nativeName[0], item.name[0] ];
                var query = client.query( "INSERT INTO language( iso639_1, iso639_2, iso639_3, local_name, english_name, enabled ) values( $1, $2, $3, $4, $5, 0 )", params );
                
                query.on( 'error', function( error ) {
                    logger.trace( "ERROR : " + error.message );
                });
            }
        });

        // on enable juste les languages actuellement implémenté

        client.query( "UPDATE language set enabled = 1 where english_name = 'French'");
        client.query( "UPDATE language set enabled = 1 where english_name = 'English'");
        client.query( "UPDATE language set enabled = 1 where english_name = 'Spanish'");

        // on liste le contenu de la tableau

        var query2 = client.query( "SELECT COUNT(*) FROM " + this.name );

        query2.on( 'error', function( error ) {
            logger.trace( "ERROR : " + error.message );
        });

        query2.on('row', function( row, result ) {
            result.addRow(row); // accumule les records dans l'objets result, cela permettra d'utiliser result.rows[] dans le gestionnaire de l'event 'end'
        });

        var me = this;

        query2.on('end', function( result ) {
            if( result.rowCount <= 0 ) { return; }
            logger.trace( "table %s count : " + result.rows[0].count, me.name );
        });
    };
}
tableLanguage.prototype = new tableBase(); // set the parent object reference

//--------------------------------------------------------------------------------------------
function tableUnit() {
    tableBase.apply( this, arguments ); // initialize parent object's members
    
    this.init = function()
    {
        this.name = "unit";
        
        this.desc = "idunit SMALLSERIAL PRIMARY KEY";
        this.desc += ", symbol TEXT";
        this.desc += ", tag TEXT"; // tag qui devra être déporter vers la table de traduction
        this.desc += ", UNIQUE( symbol )";
    };
    
    this.load = function( client ) // override of the method of the base object
    {
        // chargement a partir du fichier de moment-timezone
        
        var file =  "../data/unit.json";
        var chaine = fs.readFileSync( file, "UTF-8" );
        var root = JSON.parse( chaine );
        
        root.unit.forEach( function( item, index ) {
        
            // insertion en bdd
            
            var params = [ item.symbol, item.tag ];
            var query = client.query( "INSERT INTO unit( symbol, tag ) values( $1, $2 )", params );
            
            query.on( 'error', function( error ) {
                logger.trace( "ERROR : " + error.message );
            });
        });
        
        // on liste le contenu de la tableau
        
        var query2 = client.query( "SELECT COUNT(*) FROM unit" );
        
        query2.on( 'error', function( error ) {
            logger.trace( "ERROR : " + error.message );
        });
        
        query2.on('row', function( row, result ) {
            result.addRow(row); // accumule les records dans l'objets result, cela permettra d'utiliser result.rows[] dans le gestionnaire de l'event 'end'
        });            

        query2.on('end', function( result ) {
            if( result.rowCount <= 0 ) { return; }
            logger.trace( "table unit count : " + result.rows[0].count );
        });            
    };
}
tableUnit.prototype = new tableBase(); // set the parent object reference

//--------------------------------------------------------------------------------------------
function tablePhysical() {
    tableBase.apply( this, arguments ); // initialize parent object's members
    
    this.init = function()
    {
        this.name = "physical";
        
        this.desc = "idphy SMALLSERIAL PRIMARY KEY";
        this.desc += ", code VARCHAR(2)";
        this.desc += ", tagcode TEXT"; // tag qui devra être déporter vers la table de traduction
        this.desc += ", cchim TEXT";
        this.desc += ", type SMALLINT"; // "0-polluant", "1-meteo", "2-technical" ou "null-undefined"
        this.desc += ", tagtype TEXT"; // tag qui devra être déporter vers la table de traduction
        this.desc += ", UNIQUE( code )";
    };
    
    this.load = function( client ) // override of the method of the base object
    {
        // chargement a partir du fichier de moment-timezone
        
        var file =  "../data/cairpol_physical.json";
        var chaine = fs.readFileSync( file, "UTF-8" );
        var root = JSON.parse( chaine );
        
        root.physical.forEach( function( item, index ) {
        
            // insertion en bdd
            
            var tagtype = "Divers";
            if( item.type == 0 ) { tagtype = "Polluant";  }
            if( item.type == 1 ) { tagtype = "Méteo";     }
            if( item.type == 2 ) { tagtype = "Technique"; }
            
            var params = [ item.code, item.cchim, item.type, item.tagcode, tagtype ];
            var query = client.query( "INSERT INTO physical( code, cchim, type, tagcode, tagtype ) values( $1, $2, $3, $4, $5 )", params );
            
            query.on( 'error', function( error ) {
                logger.trace( "ERROR : " + error.message );
            });
        });

        // on liste le contenu de la tableau
        
        var query2 = client.query( "SELECT COUNT(*) FROM physical" );
        
        query2.on( 'error', function( error ) {
            logger.trace( "ERROR : " + error.message );
        });
        
        query2.on('row', function( row, result ) {
            result.addRow(row); // accumule les records dans l'objets result, cela permettra d'utiliser result.rows[] dans le gestionnaire de l'event 'end'
        });            

        query2.on('end', function( result ) {
            if( result.rowCount <= 0 ) { return; }
            logger.trace( "table physical count : " + result.rows[0].count );
        });            
    };
}
tablePhysical.prototype = new tableBase(); // set the parent object reference

//--------------------------------------------------------------------------------------------
function tableTimezone() {
    tableBase.apply( this, arguments ); // initialize parent object's members
    
    this.init = function()
    {
        this.name = "timezone";
        
        this.desc = "idtz SMALLSERIAL PRIMARY KEY";
        this.desc += ", timezone TEXT not null";
        this.desc += ", UNIQUE( timezone )";
    };
    
    this.load = function( client ) // override of the method of the base object
    {
        // chargement a partir du fichier de moment-timezone
        
        var file =  "../node_modules/moment-timezone/data/unpacked/latest.json";
        var chaine = fs.readFileSync( file, "UTF-8" );
        var timezones = JSON.parse( chaine );
        
        timezones.zones.forEach( function( item, index ) {
        
            // insertion en bdd
            
            var params = [ item.name ];
            var query = client.query( "INSERT INTO timezone( timezone ) values( $1 )", params );
            
            query.on( 'error', function( error ) {
                logger.trace( "ERROR : " + error.message );
            });
        });
        
        // on liste le contenu de la tableau
        
        var query2 = client.query( "SELECT COUNT(*) FROM timezone" );
        
        query2.on( 'error', function( error ) {
            logger.trace( "ERROR : " + error.message );
        });
        
        query2.on('row', function( row, result ) {
            result.addRow(row); // accumule les records dans l'objets result, cela permettra d'utiliser result.rows[] dans le gestionnaire de l'event 'end'
        });            

        query2.on('end', function( result ) {
            if( result.rowCount <= 0 ) { return; }
            logger.trace( "table timezone count : " + result.rows[0].count );
        });            
    };
}
tableTimezone.prototype = new tableBase(); // set the parent object reference

//--------------------------------------------------------------------------------------------
function tableCustomer() {
    tableBase.apply( this, arguments ); // initialize parent object's members
    
    var me = this;

    this.init = function()
    {
        this.name = "customer";
        
        this.desc =  "idcust SMALLSERIAL PRIMARY KEY"; // small int autoincrementing
        this.desc += ", company TEXT";
        this.desc += ", maxlogin SMALLINT";
        this.desc += ", dateend timestamp"; // end of subscription date (date de fin d'abonnement)  
        this.desc += ", status SMALLINT";
        this.desc += ", filter SMALLINT";
        this.desc += ", storage_max FLOAT4";
        this.desc += ", storage_used FLOAT4";
        
        // parametres spécifiques pour les capteurs cairpols de ce client
        
        this.desc += ", ftp_host TEXT";
        this.desc += ", ftp_login TEXT";
        this.desc += ", ftp_password TEXT";

        this.desc += ", ftp_local_path TEXT"; // sera utilisé si le ftp est situé sur la méme machine que le serveur web
        this.desc += ", ftp_server_scan_period SMALLINT";
        this.desc += ", ftp_sensor_scan_period SMALLINT";
        this.desc += ", ftp_spy_mode SMALLINT"; // si le client est en mode espion seulement
        
        this.desc += ", cair_sensor_rad TEXT";
        this.desc += ", cair_ntp_server TEXT";
        
        this.desc += ", clientId TEXT"; // identifiant utilisé pour dispatcher les clients entre les instance de programme cairGRPS
        
        this.desc += ", dateupdate timestamp";
    };
    
    this.populate = function( client, tables, index ) // override of the method of the base object
    {
        // insertion d'un certain nombre de coordonnée autour sur le site chimique de jarrie
        
        var customers = []; // tableau de coordonnée
        
        // idcust = 1
        customers.push({
            "company" : 'iséo simulation',
        });

        // idcust = 2
        customers.push({
            "company" : 'iséo developpement',
            "ftp_host" : "users.iseo.fr",
            "ftp_login" : "cairpol",
            "ftp_password" : "Dabsoyryb7",
            "ftp_server_scan_period" : 1,
            "ftp_sensor_scan_period" : 8,
            "cair_sensor_rad" : "18534B40096A",
            "cair_ntp_server" : "fr.pool.ntp.org",
            //"ftp_spy_mode" : 1,
            "clientId" : 'DEV'
        });

        customers.forEach( function( item, index, array ) {

            var params = [];
            var sql = "INSERT INTO " + me.name + toSqlInsertString( item, "idcust", params );
            
            var query = client.query( sql, params,
            
            function( error ) {
                if( error )
                {
                    logger.trace( "insert %j : ERROR", params );
                    logger.trace( "request : %s", query.text );
                    logger.trace( "error : %s", error.message );
                }
                else
                {
                    //logger.trace( "insert %j : OK", params );
                }
            });
        }); 
        
        // appel la fonction de l'objet parent
        tableBase.prototype.populate.call( me, client, tables, index );
    };        
    
}
tableCustomer.prototype = new tableBase(); // set the parent object reference

//--------------------------------------------------------------------------------------------
function tablePhysicalThreshold() {
    tableBase.apply( this, arguments ); // initialize parent object's members

    var me = this;
    
    this.init = function()
    {
        this.name = "physical_threshold";
        
        this.desc =  "idth SERIAL PRIMARY KEY"; // int autoincrementing

        this.desc += ", idphy SMALLINT references physical(idphy)";
        this.desc += ", idcust SMALLINT references customer(idcust)";

        this.desc += ", default_color TEXT";
        this.desc += ", threshold_1 FLOAT4"; this.desc += ", color_1 TEXT";
        this.desc += ", threshold_2 FLOAT4"; this.desc += ", color_2 TEXT";
        this.desc += ", threshold_3 FLOAT4"; this.desc += ", color_3 TEXT";
        this.desc += ", threshold_4 FLOAT4"; this.desc += ", color_4 TEXT";
        this.desc += ", threshold_5 FLOAT4"; this.desc += ", color_5 TEXT";
        this.desc += ", threshold_6 FLOAT4"; this.desc += ", color_6 TEXT";
        this.desc += ", threshold_7 FLOAT4"; this.desc += ", color_7 TEXT";
        
        this.desc += ", dateupdate timestamp";
        
        this.index.push( 'idcust' );
        this.index.push( 'idphy' );
    };
    
    this.load = function( client ) // override of the method of the base object
    {
        // chargement a partir du fichier de moment-timezone
        
        var file =  "../data/physical_thresholds.json";
        var chaine = fs.readFileSync( file, "UTF-8" );
        var root = JSON.parse( chaine );
        
        root.physical_thresholds.forEach( function( item, index ) {

            var params = [ item.code ]; // idcust sera = null car ce sont les valeurs par défaut
        
            var sql1 = "INSERT INTO " + me.name + "( idphy, dateupdate, default_color";
            var sql2 = "select idphy, CURRENT_TIMESTAMP, '" + item.default_color + "'";
    
            item.thresholds.forEach( function( item, index ) {
                
                sql1 += ", threshold_" + (index + 1) + ", color_" + (index + 1);
                sql2 += ", '" + item.value + "', '" + item.color + "'";
            });
            
            sql1 += ") ";
            sql2 += " from physical where code = $1";
            
            var query = client.query( sql1 + sql2, params );
            
            //logger.trace( "query = %s, params = %j", query.text, params );
            
            query.on( 'error', function( error ) {
                logger.trace( "ERROR : " + error.message );
            });
        });
    };
}
tablePhysicalThreshold.prototype = new tableBase(); // set the parent object reference

//--------------------------------------------------------------------------------------------
function tableLogin() {
    tableBase.apply( this, arguments ); // initialize parent object's members
    
    var me = this;
    
    this.init = function()
    {
        this.name = "login";
        
        this.desc = "idlog SMALLSERIAL PRIMARY KEY"; // autoincrement
        this.desc += ", login TEXT";
        this.desc += ", password TEXT"; // hashed
        this.desc += ", email TEXT";
        this.desc += ", firstname TEXT"; // prenom
        this.desc += ", surname TEXT";   // nom de famille
        this.desc += ", timezone TEXT"; // timezone du user
        this.desc += ", tzdisplay TEXT"; // timezone souhaité pour l'affichage des dates ("[user]" or "une chaine de timezone de la table timezone")
        this.desc += ", date_format TEXT";   // format de la date
        this.desc += ", temperature_unit SMALLINT"; // °C or °F
        this.desc += ", profile TEXT";   // profile de l'utilisateur
        this.desc += ", status SMALLINT";
        this.desc += ", dateupdate timestamp";
        this.desc += ", idlng SMALLINT references language(idlng)";
        this.desc += ", idcust SMALLINT references customer(idcust)";
        this.desc += ", UNIQUE( login )";
        
        this.index.push( 'idlng' );
        this.index.push( 'idcust' );
    };

    this.populate = function( client, tables, index ) // override of the method of the base object
    {
        // insertion d'un certain nombre de coordonnées autour sur le site chimique de jarrie
        
        var users = []; // tableau de coordonnée

        users.push( { 
            "login" : 'sales',
            "password" : 'ventedebrice2015',
            "email" : 'philippe.ripoll@iseo.fr',
            "firstname" : 'Sales',
            "surname" : 'Account',
            "timezone" : 'Europe/Paris',
            "tzdisplay" : 'Europe/Paris',
            "idlng" : 43,  // en / english
            //"idcust" : null
            });

        users.push( { 
            "login" : 'jla',
            "password" : 'jlap',
            "email" : 'jean-louis.arias@iseo.fr',
            "firstname" : 'Jean Louis',
            "surname" : 'Arias',
            "timezone" : 'Europe/Paris',
            "tzdisplay" : 'Europe/Paris',
            "idlng" : 152,  // sp / spanish
            "idcust" : 1
            });

        users.push( { 
            "login" : 'pri',
            "password" : 'prip',
            "email" : 'philippe.ripoll@iseo.fr',
            "firstname" : 'Philippe',
            "surname" : 'RIPOLL',
            "timezone" : 'Europe/Paris',
            "tzdisplay" : 'Europe/Paris',
            "idlng" : 50,  // fr / french
            "idcust" : 2
            });

        users.push( { 
            "login" : 'mpe',
            "password" : 'mpep',
            "email" : 'mpe@iseo.fr',
            "firstname" : 'Marc',
            "surname" : 'PENA',
            "timezone" : 'Europe/Paris',
            "tzdisplay" : 'Europe/Paris',
            "idlng" : 50,  // fr / french
            "idcust" : 1 
            });

        users.push( { 
            "login" : 'mot',
            "password" : 'motp',
            "email" : 'mot@iseo.fr',
            "firstname" : 'Mathieu',
            "surname" : 'OTHACEHE',
            "timezone" : 'Europe/Paris',
            "tzdisplay" : 'Europe/Paris',
            "idlng" : 50,  // fr / french
            "idcust" : 1
            });

        users.push( { 
            "login" : 'pbo',
            "password" : 'pbop',
            "email" : 'pbo@iseo.fr',
            "firstname" : 'Patrice',
            "surname" : 'BONNET',
            "timezone" : 'Europe/Paris',
            "tzdisplay" : 'Europe/Paris',
            "idlng" : 50,  // fr / french
            "idcust" : 1
            });

        users.push( { 
            "login" : 'lco',
            "password" : 'lcop',
            "email" : 'lisa.cosgrave@iseo.fr',
            "firstname" : 'Lisa',
            "surname" : 'Cosgrave',
            "timezone" : 'Europe/Paris',
            "tzdisplay" : 'Europe/Paris',
            "idlng" : 43,  // en / english
            "idcust" : 1
            });

        users.push( { 
            "login" : 'mhi',
            "password" : 'mhip',
            "email" : 'm.wadekar@environnement-sa.com',
            "firstname" : 'Mohini',
            "surname" : 'WADEKAR',
            "timezone" : 'Indian/Antananarivo',
            "tzdisplay" : 'Indian/Antananarivo',
            "idlng" : 80,  // ks / kashmiri
            "idcust" : 1
            });

        users.forEach( function( item, index, array ) {
                
            // pour chaque couple de coordonnées
            // insertion en bdd
            
            var hash = bcrypt.hashSync( item.password ); // encryption du password
            //   bCrypt.hashSync(password, bCrypt.genSaltSync(10), null)
            
            var params = [ item.login, hash, item.email, item.firstname, item.surname, item.timezone, item.tzdisplay, item.idlng, item.idcust ];
            var query = client.query( "INSERT INTO login( login, password, email, firstname, surname, timezone, tzdisplay, idlng, idcust, dateupdate ) values( $1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP )", params,
            function( error ) {
                if( error )
                {
                    logger.trace( "insert %j : ERROR", params );
                    logger.trace( "request : %s", query.text );
                    logger.trace( "error : %s", error.message );
                }
                else
                {
                    //logger.trace( "insert %j : OK", params );
                }
            });
        }); 
        
        // appel la fonction de l'objet parent
        tableBase.prototype.populate.call( me, client, tables, index );
    };    
}
tableLogin.prototype = new tableBase(); // set the parent object reference

//--------------------------------------------------------------------------------------------
function tableSupervision() {
    tableBase.apply( this, arguments ); // initialize parent object's members

    this.init = function()
    {
        this.name = "supervision";
        
        this.desc =  "tagname TEXT PRIMARY KEY";
        this.desc += ", value TEXT";
        this.desc += ", status TEXT";
        this.desc += ", dateupdate TIMESTAMP";
    };
}
tableSupervision.prototype = new tableBase(); // set the parent object reference

//--------------------------------------------------------------------------------------------
function tableSession() {
    tableBase.apply( this, arguments ); // initialize parent object's members

    this.init = function()
    {
        this.name = "session";

        this.desc = "idlog SMALLINT PRIMARY KEY references login(idlog)";
        this.desc += ", lsessionid VARCHAR(40)";
        this.desc += ", datecreate timestamp";
        this.desc += ", dateaccess timestamp";

        this.index.push( 'lsessionid' );
        this.index.push( 'datecreate' );
        this.index.push( 'dateaccess' );
        
    };

}
tableSession.prototype = new tableBase(); // set the parent object reference

//--------------------------------------------------------------------------------------------
function tableAverageType() {
    tableBase.apply( this, arguments ); // initialize parent object's members
    
    this.init = function()
    {
        this.name = "average_type";
        
        this.desc = "idavg SMALLSERIAL PRIMARY KEY";
        this.desc += ", tag TEXT";
        this.desc += ", period INTEGER";
        this.desc += ", period_type VARCHAR(2)"; // ST : standard , SL : sliding
        this.desc += ", UNIQUE( period_type, period )";
    };
    
    this.load = function( client ) // override of the method of the base object
    {
        var period = [ 1, 2, 3, 4, 5, 6, 10, 15, 30, 60, 1440, 2880 ]; // periode en minutes

        period.forEach( function( item, index, array ) {
        
            // insertion en bdd
            
            var params = [ item * 60, "ST" ];
            var query = client.query( "INSERT INTO average_type( period, period_type ) values( $1, $2 )", params );
            
            query.on( 'error', function( error ) {
                logger.trace( "ERROR : " + error.message );
            });
        });
        
        // on liste le contenu de la tableau
        
        var query2 = client.query( "SELECT COUNT(*) FROM average_type" );
        
        query2.on( 'error', function( error ) {
            logger.trace( "ERROR : " + error.message );
        });
        
        query2.on('row', function( row, result ) {
            result.addRow(row); // accumule les records dans l'objets result, cela permettra d'utiliser result.rows[] dans le gestionnaire de l'event 'end'
        });            

        query2.on('end', function( result ) {
            if( result.rowCount <= 0 ) { return; }
            logger.trace( "table average_type count : " + result.rows[0].count );
        });            
    };
}
tableAverageType.prototype = new tableBase(); // set the parent object reference

//--------------------------------------------------------------------------------------------
function tableSite() {
    tableBase.apply( this, arguments ); // initialize parent object's members
    
    var me = this;
    
    this.init= function()
    {
        this.name = "site";
        
        this.desc =  "idsite SMALLSERIAL PRIMARY KEY";
        this.desc += ", timezone TEXT";
        this.desc += ", tagsite TEXT"; // tag pour le site
        this.desc += ", address TEXT"; // adresse pour le site
        this.desc += ", latitude FLOAT8";
        this.desc += ", longitude FLOAT8";
        this.desc += ", altitude FLOAT4";
        this.desc += ", tagloc TEXT"; // tag pour la localisation
        this.desc += ", status SMALLINT";
        this.desc += ", info TEXT"; // info propre au site
        this.desc += ", dateupdate timestamp";
    };

    /*
    this.create = function( client )
    {
        // creation des types necessaire a la creation
        
        var ignoreErr = function( error ) {
            
            if( error )
            {
                logger.trace( "ERROR (ignored) : " + error.message );
            }
        }
        
        client.query( "drop type if exists coord_t cascade", ignoreErr );
        client.query( "drop domain if exists latitude_t cascade", ignoreErr );
        client.query( "drop domain if exists longitude_t cascade", ignoreErr );
        
        client.query( "create domain latitude_t as double precision not null check(value>=-90 and value<=90)", ignoreErr );
        client.query( "create domain longitude_t as double precision not null check(value>-180 and value<=180)", ignoreErr );
        client.query( "create type coord_t as (latitude latitude_t, longitude longitude_t, altitude real )", ignoreErr );

        // appel la fonction de l'objet parent
        tableBase.prototype.create.call( me, client );
    };
    */
    
    this.populate = function( client, tables, index ) // override of the method of the base object
    {

        var coordinate = []; // tableau de 15 coordonnées pour les test
        
        coordinate.push( { "Lat" : 43.4475515 , "Long" : -1.5542760 , "Alt" : 267.1, "Address" : "Technopole Izarbel 64 Bidart", "Tag" : "localisation #1"  } );
        coordinate.push( { "Lat" : 43.4473743 , "Long" : -1.5535866 , "Alt" : 267.2, "Address" : "Technopole Izarbel 64 Bidart", "Tag" : "localisation #2"  } );
        coordinate.push( { "Lat" : 43.4470257 , "Long" : -1.5543618 , "Alt" : 267.3, "Address" : "Technopole Izarbel 64 Bidart", "Tag" : "localisation #3"  } );
        coordinate.push( { "Lat" : 43.4468972 , "Long" : -1.5533546 , "Alt" : 267.4, "Address" : "Technopole Izarbel 64 Bidart", "Tag" : "localisation #4"  } );
        coordinate.push( { "Lat" : 43.4463296 , "Long" : -1.5528115 , "Alt" : 267.5, "Address" : "Technopole Izarbel 64 Bidart", "Tag" : "localisation #5"  } );
        
        coordinate.push( { "Lat" : 43.4463676 , "Long" : -1.5520095 , "Alt" : 267.6, "Address" : "Technopole Izarbel 64 Bidart", "Tag" : "localisation #6"  } );
        coordinate.push( { "Lat" : 43.4454990 , "Long" : -1.5521973 , "Alt" : 267.7, "Address" : "Technopole Izarbel 64 Bidart", "Tag" : "localisation #7"  } );
        coordinate.push( { "Lat" : 43.4454357 , "Long" : -1.5531749 , "Alt" : 267.8, "Address" : "Technopole Izarbel 64 Bidart", "Tag" : "localisation #8"  } );
        coordinate.push( { "Lat" : 43.4453598 , "Long" : -1.5538696 , "Alt" : 267.9, "Address" : "Technopole Izarbel 64 Bidart", "Tag" : "localisation #9"  } );
        coordinate.push( { "Lat" : 43.4454844 , "Long" : -1.5543041 , "Alt" : 268.0, "Address" : "Technopole Izarbel 64 Bidart", "Tag" : "localisation #10" } );

        coordinate.push( { "Lat" : 43.4456986 , "Long" : -1.5546501 , "Alt" : 268.1, "Address" : "Technopole Izarbel 64 Bidart", "Tag" : "localisation #11" } );
        coordinate.push( { "Lat" : 43.4460784 , "Long" : -1.5538106 , "Alt" : 268.2, "Address" : "Technopole Izarbel 64 Bidart", "Tag" : "localisation #12" } );
        coordinate.push( { "Lat" : 43.4451164 , "Long" : -1.5529550 , "Alt" : 268.3, "Address" : "Technopole Izarbel 64 Bidart", "Tag" : "localisation #13" } );
        coordinate.push( { "Lat" : 43.4451066 , "Long" : -1.5516622 , "Alt" : 268.4, "Address" : "Technopole Izarbel 64 Bidart", "Tag" : "localisation #14" } );
        coordinate.push( { "Lat" : 43.4448340 , "Long" : -1.5515683 , "Alt" : 268.5, "Address" : "Technopole Izarbel 64 Bidart", "Tag" : "localisation #15" } );

        coordinate.forEach( function( item, index, array ) {
            
            // pour coordonnées, on crée un site ...
            
            var idsite = index + 1; // 1 à 15
            var tagsite = "Site #" + idsite;
            var timezone = "Europe/Paris";
            
            // insertion en bdd
            var params = [ idsite, timezone, tagsite, item.Lat, item.Long, item.Alt, item.Tag, item.Address ];
            
            client.query( "INSERT INTO site( idsite, timezone, tagsite, latitude, longitude, altitude, tagloc, address ) values( $1, $2, $3, $4, $5, $6, $7, $8 )", params, function( error ) {
                if( error )
                {
                    logger.trace( "insert %j : ERROR ! (%s)", params, error.message );
                }
                else
                {
                    //logger.trace( "insert %j : OK", params );
                }
            });
        });                
        
        // count the site in bdd
        
        var query2 = client.query( "SELECT COUNT(*) FROM site" );
        
        query2.on( 'error', function( error ) {
            logger.trace( "ERROR : " + error.message );
        });
        
        query2.on( 'row', function( row, result ) {
            result.addRow(row); // accumule les records dans l'objets result, cela permettra d'utiliser result.rows[] dans le gestionnaire de l'event 'end'
        });            
        
        query2.on('end', function( result )
        {
            if( result.rowCount <= 0 ) { return; }
            
            logger.trace( "table site count : " + result.rows[0].count );    
                
            // appel la fonction de l'objet parent
            tableBase.prototype.populate.call( me, client, tables, index );
        });
    };
}
tableSite.prototype = new tableBase(); // set the parent object reference

//--------------------------------------------------------------------------------------------
function tableEquipmentModel() {
    tableBase.apply( this, arguments ); // initialize parent object's members
    
    var me = this;

    this.init = function()
    {
        this.name = "equipment_model";
        
        this.desc = "idmod SMALLSERIAL PRIMARY KEY";
        this.desc += ", type TEXT";
        this.desc += ", model TEXT";
        this.desc += ", manufacturer TEXT";
        this.desc += ", version TEXT";
        this.desc += ", imageid SMALLINT";
        this.desc += ", dateupdate timestamp";
    };
    
    this.load = function( client ) // override of the method of the base object
    {
        // chargement a partir d'un fichier json ...
        
        var file =  "../data/equipment_model.json";
        var chaine = fs.readFileSync( file, "UTF-8" );
        var root = JSON.parse( chaine );

        root.equipment_model.forEach( function( item, index, array ) {
                
            item["dateupdate"] = "autofilled";
            
            var params = [];
            var sql = "INSERT INTO " + me.name + toSqlInsertString( item, "idmod", params );
            
            var query = client.query( sql, params,
            
            function( error ) {
                if( error )
                {
                    logger.error( "request : %s", query.text );
                    logger.error( "error : %s", error.message );
                }
                else
                {
                    //logger.trace( " %s : OK", sql );
                }
            });
        }); 
        
        // on liste le contenu de la tableau
        
        var query2 = client.query( "SELECT COUNT(*) FROM equipment_model" );
        
        query2.on( 'error', function( error ) {
            logger.trace( "ERROR : " + error.message );
        });
        
        query2.on('row', function( row, result ) {
            result.addRow(row); // accumule les records dans l'objets result, cela permettra d'utiliser result.rows[] dans le gestionnaire de l'event 'end'
        });

        query2.on('end', function( result ) {
            if( result.rowCount <= 0 ) { return; }
            logger.trace( "table equipment_model count : " + result.rows[0].count );
        });
    };
    
}
tableEquipmentModel.prototype = new tableBase(); // set the parent object reference

//--------------------------------------------------------------------------------------------
function tableEquipmentAssignment() {
    tableBase.apply( this, arguments ); // initialize parent object's members

    var me = this;

    this.init = function()
    {
        this.name = "equipment_assignment";
        
        this.desc = "idass SERIAL PRIMARY KEY";
        this.desc += ", serial_number TEXT";
        this.desc += ", status SMALLINT";
        this.desc += ", dateupdate timestamp";
        this.desc += ", date_sale timestamp";
        this.desc += ", date_install timestamp";
        this.desc += ", parent INTEGER references equipment_assignment(idass)";
        this.desc += ", idsite SMALLINT references site(idsite)";
        this.desc += ", idcust SMALLINT references customer(idcust)";
        this.desc += ", idmod SMALLINT references equipment_model(idmod)";
        this.desc += ", UNIQUE ( idmod, serial_number )";
        
        this.index.push( 'idcust' );
        this.index.push( 'idmod' );
        this.index.push( 'idsite' );
        this.index.push( 'parent' );
        this.index.push( 'status' );
    };
    
    this.populate = function( client, tables, index ) // override of the method of the base object
    {
        
        function getRandomSN_Cairnet() {
            
            var sn = ""; // chiffre a 15 digit
            
            var digit = [ 0, 1, 2, 3, 4, 5, 6, 7, 8, 9 ];

            for( var j = 0 ; j < 15 ; j++ )
            {
                sn += digit[  myRandomI( 0 , digit.length ) ];
            }

            return sn;
        }
        
        function getRandomSN_Cairsens( idmod ) {
            
            var sn;
            
            switch( idmod ) // 3 lettre + 10 chiffre
            {
                case 5  : sn = "CAV"; break;
                case 6  : sn = "CCB"; break;
                case 7  : sn = "CFM"; break;
                case 2  : sn = "CHM"; break;
                case 3  : sn = "CHV"; break;
                case 8  : sn = "CIV"; break;
                case 9  : sn = "CNB"; break;
                case 10 : sn = "COV"; break;
                case 4  : sn = "CSM"; break;
            }
            
            //var car = [ 'a','b','c','d','e','f','g','h','i','j','k','l','m','n','o','p','q','r','s','t','u','v','w','x','y','z' ];
            var digit = [ 0, 1, 2, 3, 4, 5, 6, 7, 8, 9 ];

            for( var j = 0 ; j < 10 ; j++ )
            {
                sn += digit[  myRandomI( 0 , digit.length ) ];
            }
            
            return sn;
        }

        // insertion d'un certain nombre de coordonnée pour la simulation

        var assignment = []; // tableau de coordonnée

        // pour idcust = 1 
        // ajout de 15 cairnet avec idsite = 1-15
        
        for( var i = 0 ; i < 15 ; i++ )        
        {
            assignment.push({
                
                "idcust" : 1,
                "idmod"  : 1, // cairnet
                "idsite" : i+1, // 1-15
                "serial_number" : getRandomSN_Cairnet()
            });
        }
        
        // pour idcust = 1 
        // ajout de 4 * 15 cairsens avec idsite = 1-15
        
        for( var i = 0 ; i < 15 ; i++ )        
        {
            for( var j = 0 ; j < 4 ; j++ )        
            {
                var idmod = myRandomI( 2, 11 ); // il y a 10 modeles de cairsens
                
                assignment.push({
                    
                    "idcust" : 1,
                    "idmod"  : idmod,
                    "idsite" : i+1, // 1-15
                    "parent" : i+1, // 1-15
                    "serial_number" : getRandomSN_Cairsens( idmod )
                });
            }
        }
        
        assignment.push({
            
            "idcust" : 2,
            "idmod"  : 1, // cairnet
            "serial_number" : "355278057492913" // numero IMEI
        });

        assignment.push({
            "idcust" : 2, 
            "idmod" :  5, // cairsens NH3
            "serial_number" : "CAV0209140005",
            "parent" : 76 // avant 15 + 4*15 = (75) le cairnet est donc le 76eme
        });

        assignment.push({
            "idcust" : 2, 
            "idmod" :  11, // cairsens dust
            "serial_number" : "DDP0200000000",
            "parent" : 76 // avant 15 + 4*15 = (75) le cairnet est donc le 76eme
        });

        assignment.forEach( function( item, index, array ) {
                
            item["dateupdate"] = "autofilled";
            item["status"]     = 2; // status = 2 installé
            
            var params = [];
            var sql = "INSERT INTO " + me.name + toSqlInsertString( item, "idass", params );
            
            var query = client.query( sql, params,
            
            function( error ) {
                if( error )
                {
                    logger.error( "request : %s", query.text );
                    logger.error( "error : %s", error.message );
                }
                else
                {
                    //logger.trace( " %s : OK", sql );
                }
            });
        }); 
        
        // appel la fonction de l'objet parent
        tableBase.prototype.populate.call( me, client, tables, index );
    };        
    
}
tableEquipmentAssignment.prototype = new tableBase(); // set the parent object reference

//--------------------------------------------------------------------------------------------
function tableMeasure() {
    tableBase.apply( this, arguments ); // initialize parent object's members
    
    var me = this;
    
    this.init= function()
    {
        this.name = "measure";
        
        this.desc =  "  idmeas SMALLSERIAL PRIMARY KEY";
        this.desc += ", tag TEXT";
        this.desc += ", fmul SMALLINT"; // fmul pour l'affichage [-9 , +9]
        
        this.desc += ", idunit SMALLINT references unit(idunit)";
        this.desc += ", idphy SMALLINT references physical(idphy)";
        this.desc += ", idass INTEGER references equipment_assignment(idass)";
        
        this.desc += ", idfla  SMALLINT references average_type(idavg)";

        this.desc += ", lastdatefla  TIMESTAMP"; // timestamp without timezone

        this.desc += ", dateupdate timestamp";

        this.index.push( 'idass' );

        /*
		case +9 : { limit =  99999000000000.0           ; break; }
		case +8 : { limit =   9999900000000.0           ; break; }
		case +7 : { limit =    999990000000.0           ; break; } 
		case +6 : { limit =     99999000000.0           ; break; }
		case +5 : { limit =      9999900000.0           ; break; }
		case +4 : { limit =       999990000.0           ; break; }
		case +3 : { limit =        99999000.0           ; break; }
		case +2 : { limit =         9999900.0           ; break; }
		case +1 : { limit =          999990.0           ; break; } // #####0
		case  0 : { limit =           99999.0           ; break; } // #####
		case -1 : { limit =            9999.9           ; break; } // ####.#
		case -2 : { limit =             999.99          ; break; } // ###.##
		case -3 : { limit =              99.999         ; break; }
		case -4 : { limit =               9.9999        ; break; }
		case -5 : { limit =               0.99999       ; break; }
		case -6 : { limit =               0.099999      ; break; } 
		case -7 : { limit =               0.0099999     ; break; }
		case -8 : { limit =               0.00099999    ; break; }
		case -9 : { limit =               0.000099999   ; break; }
        */
    };
    
    this.populate = function( client, tables, index ) // override of the method of the base object
    {
        // pour le customer 1 seulement
        // insertion d'un certain nombre de mesure pour chaque site crée précédemment
        // on recupere les cairnet et les cairsens installée
        
        var sql = " SELECT ";
        sql += "s.idsite, s.tagsite, ea.idass, ea.serial_number, em.type, em.idmod, em.model ";
        sql += "FROM site s, equipment_assignment ea, equipment_model em ";
        sql += "WHERE s.idsite = ea.idsite ";
        sql += "AND ea.idmod = em.idmod ";
        sql += "AND ea.idcust = 1 ";
        sql += "ORDER by ea.idsite asc, em.type asc ";
        
        var query = client.query( sql );
        
        query.on('row', function( row ) {
            
            //logger.trace( "%j", row );
            
            var measures = [];
            
            if( row.type == 'Cairnet' )
            {
                measures.push({ 'idfla' : 7,  'idphy' :  1, 'idunit' : 1, 'idass' : row.idass });  // batterie 10 min
                measures.push({ 'idfla' : 7,  'idphy' : 19, 'idunit' : 9, 'idass' : row.idass });  // temperature 10min
                measures.push({ 'idfla' : 7,  'idphy' : 20, 'idunit' : 1, 'idass' : row.idass });  // humidité relative 10min
            }
            if( row.type == 'Cairsens' )
            {
                measures.push({ 'idfla' : 10,  'idphy' : 21, 'idunit' : 1, 'idass' : row.idass });  // usure horaire
                
                var idphy; 
                switch( row.idmod)
                {
                    case 2:  { idphy =  5; break; } // H2S & CH4S
                    case 3:  { idphy =  5; break; } // H2S & CH4S
                    case 4:  { idphy = 11; break; } // SO2
                    case 5:  { idphy = 17; break; } // NH3
                    case 6:  { idphy =  4; break; } // O3 & NO2
                    case 7:  { idphy =  8; break; } // CH2O
                    case 8:  { idphy =  6; break; } // COV-NM
                    case 9:  { idphy = 12; break; } // NO2
                    case 10: { idphy = 13; break; } // CO
                }
                measures.push({ 'idfla' : 1,  'idphy' : idphy, 'idunit' : 46, 'idass' : row.idass });  // polluant 1 minute en fonction du model du capteur 
            }
            
            measures.forEach( function( item, index, array ) {
                
                // pour chaque mesure à créer pour cet equipement ...
                
                item[ 'tag'  ] = "Measure #" + (index+1) + " of " + row.serial_number + " " + row.model;
                item[ 'fmul' ] = myRandomI( -5, 3 ); // [ -5 ; 3 [

                var params = [];
                var query = client.query( "INSERT INTO measure " +  toSqlInsertString( item, "idmeas", params ), params, function( err ) {
                    if( err )
                    {
                        logger.trace( "%s : %s", query.text, err.message );  // dans ce cas (erreur) il y aura pas l' end-event
                    }
                });
            });
        });
            
        query.on( 'end', function() {
            
            // count the mesure in bdd
            
            var query2 = client.query( "SELECT COUNT(*) FROM measure" );
            
            query2.on( 'error', function( error ) {
                logger.trace( "ERROR : " + error.message );
            });
            
            query2.on( 'row', function( row, result ) {
                result.addRow(row); // accumule les records dans l'objets result, cela permettra d'utiliser result.rows[] dans le gestionnaire de l'event 'end'
            });            
            
            query2.on('end', function( result )
            {
                if( result.rowCount <= 0 ) { return; }
                
                logger.trace( "table measure count : " + result.rows[0].count );    
                    
                // appel la fonction de l'objet parent
                tableBase.prototype.populate.call( me, client, tables, index );
            });
        });
    };    
}
tableMeasure.prototype = new tableBase(); // set the parent object reference

//--------------------------------------------------------------------------------------------
function tableDataFLA() {
    tableBase.apply( this, arguments ); // initialize parent object's members
    
    var me = this;
    
    this.init= function()
    {
        this.name = "datafla";
        
        this.desc = "idmeas SMALLINT references measure( idmeas )";
        this.desc += ", qc char(1)";
        this.desc += ", value float4";
        this.desc += ", date timestamp"; // timestamp without timezone
        //this.desc += ", date timestamptz"; // timestamp with timezone
        
        this.desc += ", PRIMARY KEY ( idmeas, date )";
    };

    this.populate = function( client, tables, index ) // override of the method of the base object
    {
        // insertion d'un certain nombre de valeurs pour chaque mesure créee précédemment
        // on recupere les mesures qui existent
        
        var query = client.query( "SELECT m.idmeas, s.timezone, a.period FROM site s, measure m, average_type a, equipment_assignment ea WHERE s.idsite = ea.idsite AND ea.idass = m.idass AND m.idFLA = a.idavg" );
        
        query.on('row', function( row ) {
            
            // pour chaque mesure ...
            // on insere une valeur ...
            
            var idmeas = row.idmeas;
            var fuseau = row.label;
            var period = row.period;
            
            //logger.trace( "populate values for %j ...", row );
            
            var dates = [];
            
            /* important note on MomentJs 
            
               By default, moment parses and displays in local time.
               If you want to parse or display a moment in UTC, you can use moment.utc() instead of moment()
            */
            
            //var start = moment.utc().subtract( 1, 'days' ).startOf('day');
            var start = moment.utc().subtract( 15, 'days' ).startOf('day'); // debut de la journée UTC
            
            var flaCount = 0;
            var maxnb = 2; // pas plus que 2 valeurs
            var end = moment.utc(); // et pas plus tard que maintenant
            
            for( var date = start ; (flaCount<maxnb)&&(date < end) ; date.add( period, 'seconds') )
            {
                //logger.trace( "avg_period = %d date = %j", avg_period, date );    
                dates.push( moment.utc( date ) ); // put a clone of this moment into the array
                flaCount++;
            }
            
            var newvalue = { "value" : undefined, "qc" : undefined }; 
            
            var lastdate;
            
            dates.forEach( function( item, index, array ) {
                
                // generate a new value for this date
                newvalue = getNewValue( newvalue.value, newvalue.qc );
                
                var datefmt = moment.utc(item).format('YYYY/MM/DD HH:mm:ss');
                lastdate = datefmt;
                //var datefmt = moment.utc(item).format('YYYY/MM/DD HH:mm:ss UTC'); // to use with timestamptz
                var params = [ idmeas, newvalue.value, newvalue.qc, datefmt ];
                
                var query = client.query( "INSERT INTO datafla( idmeas, value, qc, date ) values( $1, $2, $3, $4 )", params, function( err ) {
                    if( err )
                    {
                        logger.trace( "insert %j : ERROR (%s)", params, err.message );  // dans ce cas (erreur) il y aura pas l' end-event
                    }
                    else
                    {
                        //logger.trace( "insert %j : OK", params );
                    }
                });
            });
            
            // then update lastfladate
            
            if( lastdate )
            {
                // traitement de la derniere date, then update lastfladate
                
                var request = "UPDATE measure set lastdatefla = to_timestamp( '" + lastdate + "', 'YYYY/MM/DD HH24:MI:SS') where idmeas = '" + idmeas + "'";

                var query2 = client.query( request, function( err ) {
                    if( err )
                    {
                        logger.trace( "%s : ERROR (%s)", request, err.message );  // dans ce cas (erreur) il y aura pas l' end-event
                    }
                    else
                    {
                        //logger.trace( "%s : OK", request );
                    }
                });
            }
        });
        
        query.on( 'end', function() {
            
            // count the value in bdd
            
            var query2 = client.query( "SELECT COUNT(*) FROM datafla" );
            
            query2.on( 'error', function( error ) {
                logger.trace( "ERROR : " + error.message );
            });
            
            query2.on('row', function( row, result ) {
                result.addRow(row); // accumule les records dans l'objets result, cela permettra d'utiliser result.rows[] dans l'event 'end'
            });            
    
            query2.on('end', function( result ) {
                if( result.rowCount <= 0 ) { return; }

                logger.trace( "table datafla count : " + result.rows[0].count );

                // appel la fonction de l'objet parent
                tableBase.prototype.populate.call( me, client, tables, index ); 
            });            
        });
    };    
}
tableDataFLA.prototype = new tableBase(); // set the parent object reference

//--------------------------------------------------------------------------------------------
function tableDataSLA1() {
    tableBase.apply( this, arguments ); // initialize parent object's members
    
    var me = this;
    
    this.init= function()
    {
        this.name = "datasla1";
        
        this.desc = "idmeas SMALLINT references measure( idmeas )";
        
        this.desc += ", qc char(1)";
        this.desc += ", value float4";
        this.desc += ", min float4";
        this.desc += ", max float4";
        this.desc += ", pvalid float4";
        this.desc += ", date timestamp"; // timestamp without timezone
        
        this.desc += ", PRIMARY KEY ( date, idmeas )"; // a essayer
    }
}
tableDataSLA1.prototype = new tableBase(); // set the parent object reference


//--------------------------------------------------------------------------------------------

function rebuildingSequences( client )
{
    /*
    https://wiki.postgresql.org/wiki/Fixing_Sequences
    
    SELECT 'SELECT SETVAL(' ||
           quote_literal(quote_ident(PGT.schemaname) || '.' || quote_ident(S.relname)) ||
           ', COALESCE(MAX(' ||quote_ident(C.attname)|| '), 1) ) FROM ' ||
           quote_ident(PGT.schemaname)|| '.'||quote_ident(T.relname)|| ';'
    FROM pg_class AS S,
         pg_depend AS D,
         pg_class AS T,
         pg_attribute AS C,
         pg_tables AS PGT
    WHERE S.relkind = 'S'
        AND S.oid = D.objid
        AND D.refobjid = T.oid
        AND D.refobjid = C.attrelid
        AND D.refobjsubid = C.attnum
        AND T.relname = PGT.tablename
    ORDER BY S.relname;
    */

    var sql = "";
    sql += " SELECT 'SELECT SETVAL(' || ";
    sql += "    quote_literal(quote_ident(PGT.schemaname) || '.' || quote_ident(S.relname)) || ";
    sql += "    ', COALESCE(MAX(' ||quote_ident(C.attname)|| '), 1) ) FROM ' || ";
    sql += "    quote_ident(PGT.schemaname)|| '.'||quote_ident(T.relname)|| ';' toplay ";
    sql += " FROM pg_class AS S, ";
    sql += "      pg_depend AS D, ";
    sql += "      pg_class AS T, ";
    sql += "      pg_attribute AS C, ";
    sql += "      pg_tables AS PGT ";
    sql += " WHERE S.relkind = 'S' ";
    sql += "     AND S.oid = D.objid ";
    sql += "     AND D.refobjid = T.oid ";
    sql += "     AND D.refobjid = C.attrelid ";
    sql += "     AND D.refobjsubid = C.attnum ";
    sql += "     AND T.relname = PGT.tablename ";
    sql += " ORDER BY S.relname ";

    // console.log( "%s", sql );

    var query = client.query( sql );

    query.on( 'error', function( error ) {
        logger.trace( "ERROR : " + error.message );
    });

    query.on('row', function( row, result ) {
        result.addRow(row); // accumule les records dans l'objets result, cela permettra d'utiliser result.rows[] dans le gestionnaire de l'event 'end'
    });

    query.on('end', function( result ) {

        result.rows.forEach( function( item, index, array ) {
            
            logger.trace( "%s ...", item.toplay );
            
            var params = [];
            client.query( item.toplay, params, function( error ) {
                if( error )
                {
                    logger.trace( "rebuilding sequence : ERROR ! (%s)", error.message );
                }
                else
                {
                    logger.trace( "rebuilding sequence : OK" );
                }
            });
        });                
    });
}

function createDb() {

    logger.trace( "createDb() ...");
    
    var client = new pg.Client({
      user: 'rsdba',
      password: 'rsdba',
      database: 'iseo_db',
      host: 'localhost',
      port: 5432
    });
    
    client.on('error', function(error) {
        logger.trace( "postgreSQL [" + error + "]");
    });      
    
    client.on('notice', function(msg) {
      //logger.trace( "notice: %j", msg );
    });    
    
    var tables = []; // liste des tables à mettre dans l'ordre de construction

    if( 0 ) 
    {
        console.log("small modification");
        
        //tables.push( new tableEquipmentModel());
        //tables.push( new tableEquipmentAssignment());
        //tables.push( new tablePhysicalThreshold());
    }
    else
    {
        console.log("full base re-recreate");
        
        tables.push( new tableLanguage()            );
        tables.push( new tableUnit()                );
        tables.push( new tablePhysical()            );
        tables.push( new tableTimezone()            );
        tables.push( new tableCustomer()            );
        tables.push( new tablePhysicalThreshold()   );
        tables.push( new tableLogin()               );
        tables.push( new tableSupervision()         );
        tables.push( new tableSession()             );
        tables.push( new tableAverageType           );
        tables.push( new tableSite()                );
        tables.push( new tableEquipmentModel()      );
        tables.push( new tableEquipmentAssignment() );
        tables.push( new tableMeasure()             );
        tables.push( new tableDataFLA()             );
//        tables.push( new tableDataSLA1()            );
    }
    
    for( var t in tables )
    {
        // pour chaque table ...
        
        tables[t].init();
        tables[t].drop( client );
    }

    for( t in tables )
    {
        tables[t].create( client );
    }
    
    for( t in tables )
    {
        tables[t].load( client );
    }
    
    for( t in tables )
    {
        tables[t].populate( client, tables, t ); // on appel juste le populate() de la premiere table, les autres appels sont recursifs
        break;
    }
    
    rebuildingSequences( client );
    
    client.on('drain', function() {
        
        // Raised when the internal query queue has been emptied
        // and all queued queries have been executed.
        // Useful for disconnecting the client after running an undetermined number of queries
        
        logger.trace( "event drain ...");
        console.log(  "event drain ...");
        
        client.end.bind( client );  // disconnect client when all queries are finished
    });
    
    /* connexion */
    client.connect();
    
    console.log( "end of createDb()");
}

createDb();
