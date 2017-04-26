
var logger = require("./logger")(); // logger iséo
var passport = require("passport"); // npm install passport
var LocalStrategy = require('passport-local').Strategy; // npm install passport-local

var model_auth = require('./models/db_auth');

passport.use( new LocalStrategy( { passReqToCallback : true }, function( req, username, password, done) {
        
    logger.trace( "LocalStrategy() username = %s password = %s ...", username, password );

    model_auth.checkAuthentification( username, password, function( err, isUserOK, isPasswordOK, isDateOK, idlog, surname, firstname, tzdisplay, language ) {

        // Verify Callback ...
        
        if( err ) {
            
             return done( err );
             
        }
        
        try
        {
            if( isUserOK == false )
            {
                return done( null, false, { message: 'This username is unknown !' });
            }
            
            if( isDateOK == false )
            {
                return done( null, false, { message: 'End of subscription date reached !' });
            }
            
            if( isPasswordOK )
            {
                // authentification succeed
                return done( null, 
                    // ceci est l'objet obj passée a la fonction serializeUser()
                    {
                    "sessionid" : req.sessionID,
                    // informations essentielles pour cet utilisateur
                    "idlog" : idlog,
                    "login" : username,
                    "surname" : surname,
                    "firstname" : firstname,
                    "lng" : language,
                    "tzdisplay" : tzdisplay
                });
            }
            else
            {
                // authentification fail
                return done( null, false, { message: 'The password is incorrect !' });
            }
        }
        catch( err )
        {
            return done( err );
        }
    });
}));

// Passport also needs to serialize and deserialize user instance from a session store
// in order to support login sessions, so that every subsequent request will not contain the user credentials.
// It provides two 

passport.serializeUser( function( req, obj, done) {
    
    logger.trace( "serializeUser obj : %j", obj );
    
    // The purpose of the serialize function is to return sufficient identifying information
    // to recover the user account on any subsequent requests.
    // Specifically the second parameter of the done() method is the information serialized into the session data.    
    
    model_auth.createSession( obj.idlog, obj.sessionid, function( id ){

        // The callback function takes as it's second parameter the identifying information
        // required to recover the account from the database.
        // This will be called on every authenticated request and stores the identifying information in the session data (whether that is in a cookie or your Redis store).
      
        done(null, id);    
    });
});
 
passport.deserializeUser(function( req, lsessionid, done) {

    //logger.trace( "deserializeUser user : %j", lsessionid ); 

    // la fonction est appelée avant chaque future acces a une page pour récuperer des informations sur le user connecté
    // ces informations seront utilisés coté serveur 

    // obtient de la database les informations de l'utilisateur connecté en se basant sur l'id fournie
    // qui va etre la sessionID + un tag
    
    // The deserialize function that you provide is intended to return the user profile based
    // on the identifying information that was serialized to the session.
    
    // The function provided to passport.deserializeUser() is called by the passport middleware,
    // passport.session() prior to the route handling to store the user profile (user) to req.user.    

    model_auth.getInfoFromSession( lsessionid, function( info ) {

        // The callback function takes as it's second parameter the identifying information
        // required to recover the account from the database.
        // This will be called on every authenticated request and stores the identifying information in the session data (whether that is in a cookie or your Redis store).
      
        if( info == undefined )
        {
            // la session peut avoir expirée
            logger.trace( "session info unavailable !" );
            req.logout();
            done(null, false);
        }
        else
        {
            done(null, info); // le contenu de info est mis dans req.user
        }
    });
});

module.exports = passport;



