
function myRandomI( low, high ) {
    // generate a pseudo random integer number beetween [ low - high [

    return Math.floor( Math.random() * (high - low) + low );
}

/*
// test of equity of the random function

var rand = {};
for( var j = 0 ; j < 300000 ; j++ ) {
    
    var random = myRandomI( 0, 30 ) // [ low - high [
    if( rand[ random ] > 0 ) 
    {
        rand[ random ]++;
    }
    else
    {
        rand[ random ] = 1;
    }
}
console.log( "%j", rand );
*/

// card object
function card( type, manaCost, label ) {

    this.type = type; // 'creature', ...
    this.manaCost = manaCost;
    this.label = label;
    
    // public method
    this.getCategorie = function()
    {
        return this.type + '_' + this.manaCost;
    };    
}

// composition du deck

//                T1  T2  T3  T4  T5  T6  T7  T8  T9  T10
var creatures = [  0,  5,  4,  5,  4,  4,  2,  0,  0,  0  ];

//                T1  T2  T3  T4  T5  T6  T7  T8  T9  T10
var weapons   = [  0,  2,  1,  0,  2,  0,  1,  0,  0,  0  ];

var handsize = 6;

//----------------------------------------------------------

var appears = {};
appears.redrawn = 0;
//appears.dead = 0;

var tryNb   = 10000;

for( var n = 0 ; n < tryNb ; n++ ) 
{
    
    // on prend 1 deck vide pour chaque essai    
    var deck = [];
    
    var filldeck = function( desc, text ) {
        
        for( var i = 0 ; i < desc.length; i++ ) // [0-9]
        {
            var count = desc[i];
            var cost  = i+1;
            
            //console.log("cost %d : count = %d", cost, count );
            
            for( var n = 0 ; n < count ; n++ )
            {
                var nc = new card( text, cost, '#card'+(deck.length+1));
                deck.push( nc );
                if( appears[ nc.getCategorie() ] == undefined)
                {
                    // init of the property
                    appears[ nc.getCategorie() ] = 0;
                }
            }
        }        
    };
    
    // on compose le deck de départ
    filldeck( creatures, 'creature' );
    filldeck( weapons  , 'weapon'   );

    // filling up to 30 cards with "other" cards
    while( deck.length < 30 )
    {
        var others = [ 1 ];
        filldeck( others, 'other' );
    }
    
    console.log( "compute try %d initial deck cards count = %d", n, deck.length );
    
    var handCount   = 0;
    var redrawCount = 0;
    var drawnNb = 0; 
    
    while( handCount < handsize )
    {
        // 1 tirage
        
        var idxcard = myRandomI( 0, deck.length ); // [ low - high [
        var drawnCard = deck[idxcard];
        drawnNb++;
        
        var keep = true;
        
        // veux t-on retirer la carte
        if( drawnNb <= 3 ){
            // seulement possible pour les trois premieres cartes
            if( redrawCount < 3 ) {
                // seulement possible trois fois
                
                if( drawnCard.type == 'creature' ) {
                    if( drawnCard.manaCost > 3 ) {
                        keep = false;
                    }
                }
                else
                {
                   keep = false; 
                }
            }
        }
        
        if( keep ) {
     
            handCount++;     
            //console.log( "%d] keep %s %s manaCost=%d", handCount, drawn.label, drawn.type, drawn.manaCost );
            // on retire cette carte du paquet
            deck.splice( idxcard, 1);
            
            // record statistics of the hands
            appears[ drawnCard.getCategorie() ]++;
        }
        else
        {
            // redraw
            //console.log( "redraw %s as %s manaCost=%d", drawn.label, drawn.type, drawn.manaCost );
            redrawCount++;
            appears.redrawn++;
            
        }
    }
}

// pour chaque proprieté de l'objet

var types = Object.keys(appears)
var cumul = 0;

console.log( "-- results --", cumul );

types.forEach( function( item, index, array ) {

    var key = item;
    
    var stat = appears[ key ] / tryNb;
    console.log( "%s : %d", key, stat );
    
    if( item != 'redrawn') {
    
        cumul += stat;    
    }
});    
console.log( "-- cumul %d --", cumul );















