
//var logger = require("./logger")(); // logger iséo
var index  = require("./routes/");     // charge le module index.js
var api    = require('./routes/api');
var appli  = require('./routes/appli');
var notify = require('./routes/notify');

module.exports = function( app ) {
    
    app.use( '/', index );
    app.use( '/api', api );
    app.use( '/appli', appli );
    app.use( '/notify', notify );
    
};
