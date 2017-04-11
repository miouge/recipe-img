
// ToDO : create the folder process.env.HOME + /trace
var logger = require("./logger")('ServerWWW'); // logger iséo

logger.info('---== Starting server.js ...==---');
console.log('---== Starting server.js ...==---');

var monitored = false;

process.argv.forEach(function (value, index, array) {
    logger.info( "command line argument[%d] : %s", index, value );
    if( value == 'monitored')
    {
        // enable monitored mode
        monitored = true;
        logger.info('monitored mode');
        console.log('monitored mode');
    }
});

var express = require('express');
var bodyParser = require('body-parser'); // Charge le middleware de gestion des paramètres

var Session = require('express-session');
var SessionStore = require('session-file-store')(Session);

var path = require('path');
var app = express();

// ------------- configuration ------------

// app.configure() : This method is no longer available (Removed in Express 4)
// https://github.com/strongloop/express/wiki/Migrating-from-3.x-to-4.x

app.set( 'port', 0+3000+0 ); // 0+3000+0 : permet de détecter le texte et de faire un remplacement avec sed pour la mise en production
app.set( 'ip'  , '10.205.226.179' );
//app.set( 'ip'  , '192.168.64.10' );

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

//var loggerM = require('morgan');
//app.use( loggerM('dev')); // met en fenetre de console des info sur les requetes entrantes

// uncomment after placing your favicon in /public
var favicon = require('serve-favicon'); // This module is exclusively for serving the "default, implicit favicon", which is GET /favicon.ico
app.use( favicon( __dirname + '/public/images/favicon-ISEO.png'));
// app.use(express.static(path.join(__dirname, 'public')));

app.use( bodyParser.urlencoded({ extended: true }) );
app.use( bodyParser.json({limit: '100mb'}) );

// Session management

const osHomedir = require('os-homedir');
var pathSessionStore = osHomedir() + /sessions/; // pathSessionStore = user home dir + /sessions/

logger.info('using as sessions folder  : <%s>', pathSessionStore );
console.log('using as sessions folder  : <%s>', pathSessionStore );

var session = Session({

//    resave: false,
//    saveUninitialized: false,
    resave: true,
    saveUninitialized: true,
    unset: 'destroy',
    // Internal session data storage engine, this is the default engine embedded with connect.
    // Much more can be found as external modules (Redis, Mongo, Mysql, file...). look at "npm search connect session store"
    store: new SessionStore({ path: pathSessionStore, 
                           //ttl : 3600,
                           ttl : 86400 * 30, // 30 jours
                           //retries : -1, // means no retries
                           retries : 5, // in case of concurrent access to this file
                           factor : 2,
                           minTimeout : 50,
                           maxTimeout : 200,
                           //reapInterval : 3600 // au bout de ttl + reapInterval les fichiers de sessions expirées sont détruits
                           reapInterval : -1 // not needed 
    }),
    // Private crypting key
    secret : 'C8F2813C-BF7F-4953-B448-18ADA8DD9F10'
});

app.use( session ); // the same item session will be used for socket io

// Authentification

var passport = require('./auth');
app.use( passport.initialize() ); // must be put after express-session
app.use( passport.session()    );

// --------- définition des routes --------

var routes = require("./routes.js");
routes( app );

// --------- mise en ecoute HTTP --------

var server = app.listen( app.get('port'), app.get('ip'), function() {
    
    logger.info('express server is now listening on ip <%s> port <%d>', app.get('ip'), app.get('port'));
    console.log('express server is now listening on ip <%s> port <%d>', app.get('ip'), app.get('port'));

    // --------- initialisation et mise en ecoute du server de Socket IO --------
    
    var sio = require('./socket_io')();
    sio.init( server, session, function( sio ) {
        logger.info('socket io server started and initialized' );
        
        if( monitored )
        {
            // --------- initialisation du watchdog --------
            var wd = require('./watchdog')();
            wd.init();
            logger.info('watchdog started.' );
        }
    });
});

console.log( "server.js loaded !" );
console.log( "trace folder : %s/trace", process.env.HOME );


module.exports = app;

