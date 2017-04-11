
var logger = require("../logger")(); // logger iséo

function requireAuthenticationR(req, res, next) {
    
    //logger.trace("requireAuthentication() ...");
    
    if( req.user == undefined )
    {
        // l'utilisateur n'est pas actuellement authentifié
        logger.trace( "requireAuthenticationR( route %s ) : user is UNDEFINED -> redirect to /login", req.originalUrl );
        return res.redirect('/login');
    }
    
    //logger.trace( "access granted for authentified user (%s %s %s)", req.user.firstname, req.user.surname, req.user.timezone ); 
    //logger.trace( "the user is correctly authentified");
    //logger.trace( "req.user = %j", req.user );
    //logger.trace( "session = %j", req.session );
    //logger.trace( "sessionID = %j", req.sessionID );

    next(); // L'appel à next() indique qu'on souhaite continuer la chaîne des middlewares
            // Si on interrompt ici cette chaîne, sans avoir renvoyé de réponse au client, il n'y aura
            // pas d'autres traitements, et le client verra simplement une page mouliner dans le vide...
    
}

function requireAuthenticationD(req, res, next) {
    
    if( req.user == undefined )
    {
        logger.trace( "requireAuthenticationR( route %s ) : user is UNDEFINED -> reply with code 401", req.originalUrl );
        res.status(401); // 401 Unauthorized Une authentification est nécessaire pour accéder à la ressource
        res.send();
        return;
    }
    next();
}

module.exports.requireAuthentication = requireAuthenticationR;
module.exports.requireAuthenticationD = requireAuthenticationD;
