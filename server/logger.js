
var fs = require('fs');
var path = require('path');

var STR_PAD_LEFT = 1;
var STR_PAD_RIGHT = 2;
var STR_PAD_BOTH = 3;

function padZeros( number, digitnb ) 
{
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

/**
*
*  Javascript string pad
*  http://www.webtoolkit.info/
*
**/

var STR_PAD_LEFT = 1;
var STR_PAD_RIGHT = 2;
var STR_PAD_BOTH = 3;

function pad( str, len, pad, dir) {

    if (typeof(len) == "undefined") { var len = 0; }
    if (typeof(pad) == "undefined") { var pad = ' '; }
    if (typeof(dir) == "undefined") { var dir = STR_PAD_RIGHT; }

    if (len + 1 >= str.length) {

        switch (dir){

            case STR_PAD_LEFT:
                str = Array(len + 1 - str.length).join(pad) + str;
            break;

            case STR_PAD_BOTH:
                var padlen;
                var right = Math.ceil((padlen = len - str.length) / 2);
                var left = padlen - right;
                str = Array(left+1).join(pad) + str + Array(right+1).join(pad);
            break;

            default:
                str = str + Array(len + 1 - str.length).join(pad);
            break;

        } // switch

    }

    return str;
}

var file_prefix = 'Server'; // prefix du fichier de trace

var logger = require('tracer').console({

    format : [
              "{{timestamp}} {{file}}{{title}} : {{message}}", //default format
              
              {
                  // format spécifique pour les erreurs
                  //error : "{{timestamp}} {{file}}{{title}} : {{message}}\nCall Stack:\n{{stack}}", //error format
              } 
    ],    
    
    dateformat : "HH:MM:ss.l",    

    preprocess :  function( data ) {
        
        if(( data.title == 'warn' )||( data.title == 'error' )) {  
            data.title = data.title.toUpperCase();
        }
        
        data.title = pad( data.title, 5, ' ', STR_PAD_RIGHT );
        data.file = pad( data.file + '(' + data.line + ')', 20, ' ', STR_PAD_RIGHT );
        data.line = "";
        
    },

    transport : function( data ) {
        
        // output to file 
        
        var now = new Date();
        
        var chaine =  padZeros( now.getFullYear() , 4 ) + '-'
                    + padZeros( now.getMonth() +1 , 2 ) + '-'
                    + padZeros( now.getDate()     , 2 );

        var filename  = file_prefix + '_' + chaine + '.log';
        
        //var tracepath = path.normalize( __dirname + '/trace/' );
        //var tracepath = path.normalize( process.env.HOME + '/trace/' );
        
        var tracepath = path.normalize( '/home/ubuntu/workspace/server/trace/' );

        //toDo 
        // var osenv = require('osenv')
        // var path = osenv.path()
        // var user = osenv.user()

        // faire une ecriture synchrone pour préserver l'ordre d'arrivée des traces

        /*
        fs.open( tracepath + filename, 'a', function( e, id ) {
            
            fs.write( id, data.output + "\n", null, 'utf8', function() {
                    fs.close(id, function() {
                });
            });
        });
        */
        
        // write synchrone
        
        var id = fs.openSync( tracepath + filename, 'a' );
        fs.writeSync( id, data.output + "\n", null, 'utf8' );
        fs.closeSync( id );
        
        // toDo : pour les erreurs mettre en BDD ?
    }
});

// exemple d'utilisation 
// logger.log('hello');
// logger.trace('hello', 'world');
// logger.debug('hello %s', 'world', 123);
// logger.info('hello %s %d', 'world', 123, {foo : 'bar'});
// logger.warn('hello %s %d %j', 'world', 123, {foo : 'bar'});
// logger.error('hello %s %d %j', 'world', 123, {foo : 'bar'}, [ 1, 2, 3, 4 ],logger );

module.exports = function( prefix ) // le parametre prefix est optionnel et ne devrait être spécifié que la premiere fois
{
    if( prefix ) {
        
        // changement du prefix du fichier de trace à créer
        file_prefix = prefix;
    }
    return logger;
};

