
/**
* Module dependencies.
*/

var express = require( "express" ),
	carteroMiddleware = require( "cartero-express-hook" ),
	http = require( "http" ),
	cons = require('consolidate'),
	swig = require('swig'),
	path = require( "path" ),
	fs = require( "fs" ),
	_ = require( "underscore" ),
	_s = require( "underscore.string" );


var app = express();

var kStaticDir = path.join( __dirname, "static" );
var kAppPagesDir = path.join( __dirname, "views" );

app.configure( function() {
	app.set( "port" , process.env.PORT || 3000 );
	app.set( "views" , __dirname + "/views" );
	app.set( "view engine", "swig");
	app.use( express.favicon() );
	app.use( express.logger( "dev" ) );
	app.use( express.bodyParser() );
	app.use( express.methodOverride() );
	app.use( carteroMiddleware(  __dirname ) );
	app.use( express.cookieParser( "your secret here" ) );
	app.use( express.session() );
	app.use( app.router );
	app.use( express.static( kStaticDir ) );
} );

app.engine( ".swig", cons.swig );

swig.init({
    allowErrors: true, // allows errors to be thrown and caught by express instead of suppressed by Swig
    root : __dirname + "/views"
});

app.configure( "development" , function() {
	app.use( express.errorHandler() );
} );

app.get( "/page1/page1.html.swig", function( req, res ) {
	res.render( kAppPagesDir + "/page1/page1.html.swig" );
} );

app.get( "/page3/page3.html.swig", function( req, res ) {
	res.render( kAppPagesDir + "/page3/page3.html.swig" );
} );

app.get( "/personInfo/personInfo.html.swig", function( req, res ) {
	res.render( kAppPagesDir + "/personInfo/personInfo.html.swig" );
} );

app.get( "/page2/page2.html.swig", function( req, res ) {
	res.render( kAppPagesDir + "/page2/page2.html.swig" );
} );

app.get("/page1/page1_1/page1_1.html.swig", function( req, res ) {
	res.render( kAppPagesDir + "/page1/page1_1/page1_1.html.swig" );
} );

app.get( "/login*", function( req, res ) {
	res.render( "web-terminal/login.swig" );
} );

http.createServer( app ).listen( app.get( "port" ), function() {
	console.log( "Express server listening on port " + app.get("port") );
} );
