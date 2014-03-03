var express = require( "express" ),
	// to be replaced with new hook
	carteroMiddleware = require( "cartero-express-hook" ),
	http = require( "http" ),
	path = require( "path" );

var app = express();

app.configure( function() {
	app.set( "port" , process.env.PORT || 3000 );
	app.set( "views" , __dirname + "/views" );
	app.set( "view engine", "jade");
	app.use( express.favicon() );
	app.use( express.logger( "dev" ) );
	app.use( express.bodyParser() );
	app.use( express.methodOverride() );
	app.use( carteroMiddleware(  { assetsDir : path.join( __dirname, "static", "assets" ), assetsBaseUrl : "/assets" } ) );
	app.use( express.cookieParser( "your secret here" ) );
	app.use( express.session() );
	app.use( app.router );
	app.use( express.static( path.join( __dirname, "static" ) ) );
} );

app.configure( "development" , function() {
	app.use( express.errorHandler() );
} );

app.get( "/", function( req, res ) {
	res.render( "index.jade" );
} );

app.get( "/page1", function( req, res ) {
	res.render( "page1/page1.jade" );
} );

http.createServer( app ).listen( app.get( "port" ), function() {
	console.log( "Express server listening on port " + app.get("port") );
} );