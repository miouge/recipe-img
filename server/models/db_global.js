var logger = require("../logger")(); // logger iséo

module.exports.getConnectionString = function() {
    
    // return the connection string
    return 'postgres://rsdba:rsdba@localhost:5432/iseo_db';
};

module.exports.isPgConnectionKO = function isPgConnectionKO( err, done, callback ) {

    if( ! err )
    {
        // no error occurred, continue with the request
        return false;
    }
    else
    {
        // An error occurred, remove the client from the connection pool.
        // A truthy value passed to done will remove the connection from the pool
        // instead of simply returning it to be reused.
        // In this case, if we have successfully received a client (truthy)
        // then it will be removed from the pool.

        logger.error("unable get a pg client from the connection pool !");
        done();
        
        if( callback )
        {
            callback( {}, 500 ); // then send a empty json
        }
        return true;
    }
};

module.exports.handleQueryError = function( done, callback, feedback ) {
    
    // release the connection to the pool
    done();

    if( callback )
    {
        if( feedback == undefined )
        {
            callback( {}, 500 ); // then send a empty json
        }
        else
        {
            callback( { "error" : feedback }, 500 ); // then send a empty json
        }
    }
};

module.exports.parseReqRecord  = function( req, rootParam ) {
    
    if( req.query[ rootParam ] != undefined )
    {
        logger.trace( "record object found in query param %j", req.query[ rootParam ] );
        return JSON.parse( req.query[ rootParam ] );
    }
    if( req.body[ rootParam ] != undefined )
    {
        logger.trace( "record object found in body param %j", req.body[ rootParam ] );
        return JSON.parse( req.body[ rootParam ] );
    }
};

module.exports.toSqlInsertString = function( record, idpk, params ) {
    
    var columnIdx = 0; // index du champ
    
    var column = " (";
    var values = " VALUES(";
    
    for( var prop in record )
    {
        // pour chaque couple de valeurs
        
        //logger.trace( "(INSERT) record property [%s] = <%s>", prop, record[prop] );
                
        if( prop == idpk )
        {
            // on ignore un champ qui serait la pk puisqu'elle doit toujours etre autoincrementable lors de l'insertion
            continue;
        }
        
        // gestion des valeurs null
        
        if( record[prop] == null ) 
        {
            // on ignore la colonne, car a l'insertion d'une colonne absente sa valeur sera null
            continue;
        }
        
        if( columnIdx > 0 )
        {
            column  += ", ";
            values  += ", ";
        }
        
        // ajout au nom des champs à inserer
        column += prop;
        columnIdx++;
        
        // gestion particuliere du champ de date de mise a jour de la table
        if( prop == "dateupdate" )
        {
            values += "CURRENT_TIMESTAMP";
            continue;
        }
        
        // sinon        
        params.push( record[prop] ); // ajout d'un parametre pour la requete pg
        values += "$" + params.length; // 1ere valeur -> $1
    }
    
    // finalement
    column += ")";
    values += ")";    
    
    return  column + values;
};

module.exports.toSqlUpdateString= function( record, idpk, params ) {
    
    var columnIdx = 0;
    var setString = " SET ";
    var whereString  = " WHERE ";
    
    for( var prop in record )
    {
        //logger.trace( "(UPDATE) record property [%s] = <%s>", prop, record[prop] );
        
        if( prop == idpk )
        {
            // si la pk est absente la forme de la requete sera invalide
            // si elle est présente on s'en sert pour composé la clause WHERE
            
            params.push( record[prop] ); // ajout d'un parametre pour la requete
            whereString += prop + "=$" + params.length; // 1ere valeur $1
            continue;
        }
        else
        {
            if( columnIdx > 0 )
            {
                setString += ", ";
            }
            
            // gestion des valeurs null
            if( record[prop] == null ) 
            {
                setString += prop + "=NULL";
            }
            else
            {
                // gestion particuliere du champ de date de mise a jour de la table
                if( prop == "dateupdate" )
                {
                    setString += prop + "=CURRENT_TIMESTAMP";
                }
                else
                {
                    params.push( record[prop] ); // ajout d'un parametre pour la requete
                    setString += prop + "=$" + params.length; // 1ere valeur -> $1
                }
            }
        }
        columnIdx++;
    }

    return setString + whereString;
};

module.exports.removeRecordField= function( record, field ) {
    
    if( record[ field ] != undefined )
    {
        logger.trace( "record property [%s] = <%s> : removed !", field, record[ field ] );
        delete record[ field ];
    }
};
