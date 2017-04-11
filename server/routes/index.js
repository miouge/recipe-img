
var logger = require("../logger")(); // logger iséo
var path = require("path");
var express = require('express');

var router = express.Router();
var passport = require('../auth');
var util = require('../util');
var model_auth = require('../models/db_auth');
var sio = require('../socket_io')();

router.get('/', function(req, res) {

    //res.end("welcome to home page ! your session ID is : " + req.sessionID );
    res.redirect( '/login' );
});

/*
// -- page de login avec 1 simple html 
router.get('/login', function(req, res) {
  
    // __dirname returns the directory that the currently executing script is in
    // res.sendFile(path, [options], [fn])
    // path correspond au fichier que tu veux retourner donc tu dois le d�finir, par exemple 'var path = req.params.name;' ou pour toi res.sendFile("C:\wamp\www\dev\index.php"); .
    // options n'est pas obligatoire, il permet de d�finir les headers de ta page (informations cach�es) au format JSON.
    // fn est ta fonction de callback.

    var absolutePath = path.join(__dirname, '../views', 'login.html');
    res.sendFile( absolutePath );
});
*/

// -- page de login avec jade

router.use( '/images'     , express.static( './public/images'      ));
router.use( '/stylesheets', express.static( './public/stylesheets' ));
router.use( '/js'         , express.static( './public/js'          ));

router.get('/login', function(req, res, next) {

    // ToDo : detect mobile or desktop (see ua-parser npm)
    //var userAgent = req.headers['user-agent'];
    
    var renderLng = "en";
    
    // detect local language (if possible)
    
    var acceptLanguage = req.headers['accept-language']; // //"fr-FR,fr;q=0.8,en-US;q=0.6,en;q=0.4"
    if( acceptLanguage ) {
        
        var lng = acceptLanguage.split(/[,-;]/); // separation lsessionid et socket id (mais on ne prend que le 1er champ)
    
        for( var i = 0, max = lng.length ; i < max ; i++ )
        {
            if( lng[i] == 'fr' ) { renderLng = 'fr'; break; }
        }
    }

    if( renderLng == "fr" )
    {
        res.render('login', {
            introduction : "Identification",
            placeholderUname : " Identifiant",
            placeholderPword : " Mot de passe",
            valueSubmit     : "Connexion"
        });
    }
    else
    {
        res.render('login', {
            introduction : "User Login",
            placeholderUname : " Username",
            placeholderPword : " Password",
            valueSubmit     : "Submit"
        });
    }
});


router.post('/login', passport.authenticate('local', { failureRedirect: '/login' }), function(req, res) {
    
    // If this function gets called, authentication was successful.
    // req.user contains the authenticated user.
    
    req.session.messages = "Login successfully";
    logger.trace( "request is now authentified as idlog=%s login=%s sessionid=%s", req.user.idlog, req.user.login, req.user.sessionid );
    
    // the language for this user has been extracted and stored into the session object req.user (by checkAuthentification)
    
    var url = '/appli/?lng=' + req.user.lng;
    res.redirect( url );

});

router.get('/disconnect', function(req, res, next) {

    var isAuthenticated = req.isAuthenticated();
    
    logger.trace( "/disconnect : isAuthenticated = %d", isAuthenticated );
    
    if( isAuthenticated ) {
        
        logger.trace( "logout user idlog=%s login=%s ...", req.user.idlog, req.user.login );
        
        // 1) purge table session
        
        model_auth.destroySession( req.user.lsessionid, function( err ) {
            
            if( err == false )
            {
                logger.trace( "table session purged !");
                
                // 2) logout from passport (je crois)
                
                req.logout();
                
                // 3) destroy session object and file
                
                req.session.destroy( function() {
        
                    // cannot access anymore req.session content here 
                    logger.trace( "session object destroyed -> req.session IS NOW = %j", req.session );
                    
                    // acquittement de la requete
                    util.wrapAnswer(req.query.callback, res, {"success": "true"}, 200 );
                    
                });
            }
        });
    }
    else
    {
        util.wrapAnswer(req.query.callback, res, {"success": "false"}, 401 );
    }
});

router.get( '/activity', function(req, res) {

    var grant = false;
    
    if( req.user != undefined )
    {
        if( req.user.login != undefined ) 
        {
            if( req.user.login == 'pri' )
            {
                // seulement le user Philippe RIPOLL a le droit d'utiliser cette route
                grant = true;
            }
        }
    }
    
    if( grant )
    {
        // on recupère la liste des sessions io actuellement active
        var lsessionids = sio.get();
        
        // on se procure les informations des utilisateurs concernant ces sessions actives
        model_auth.getActivity( lsessionids,
            function( json, status ) {
            util.wrapAnswer( req.query.callback, res, json, status );
        });
    }
    else
    {
        res.status(401); // 401 Unauthorized Une authentification est nécessaire pour accéder à la ressource
        res.send();
        return;
    }
});

module.exports = router;
