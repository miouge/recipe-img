
var logger = require("./logger")(); // logger iséo

module.exports.wrapAnswer = function( callback, res, ret, status ) {

    if( status )
    {
        res.status(status);
    }
    else
    {
        res.status(200);
    }

    if( callback )
    {
        // JSONP
        res.setHeader( 'content-type', 'text/javascript' );
        res.send( callback + '(' + JSON.stringify(ret) + ');' );
    }
    else
    {
        res.json(ret);
    }
};

module.exports.round = function( value, precision, rtype ) {

    // arrondi 
    // rtype 0 : a l'inferieur
    // rtype 1 : au superieur
    // rtype undefined : au plus pres
    // precision : nombre derriere la virgule
    //
    // precision and type are optionnal
    // default : precision = 0  rtype = undefined
    
    switch( rtype )
    {
        default:
        case undefined : {
            var fn = Math.round; // arrondi au plus pres
            break;
        }
        case 0 : {
            var fn = Math.floor; // 0.99999999, 3 -> 0.999
            break;
        }
        case 1 : {
            var fn = Math.ceil;  // 0.1111111, 3 -> 0.112
            break;
        }
    }
    
    if( precision == undefined )
    {
        return fn( value );
    }
    else
    {
        var prec = Math.pow( 10, precision );
        return fn( value * prec ) / prec ;
    }
};
