
/**
* Module dependencies.
*/

var express = require( "express" ),
	//routeManager = require( "./Libraries/routeManager.js" ),
	assetBundlerMiddleware = require( "grunt-asset-bundler/middleware.js" ),
	http = require( "http" ),
	cons = require('consolidate'),
	swig = require('swig'),
	path = require( "path" ),
	fs = require( "fs" ),
	_ = require( "underscore" ),
	_s = require( "underscore.string" );


var app = express();

var kStaticDir = path.join( __dirname, "Static" );
var kAppPagesDir = path.join( __dirname, "AppPages" );

var projectRoot = "..";

app.configure( function() {
	app.set( "port" , process.env.PORT || 3000 );
	app.set( "views" , __dirname + "/AppPages" );
	//app.set( "views", __dirname );
	app.set( "view engine", "swig");
	app.use( express.favicon() );
	app.use( express.logger( "dev" ) );
	app.use( express.bodyParser() );
	app.use( express.methodOverride() );
	//app.use( myMethod() );
	app.use( assetBundlerMiddleware( path.join( __dirname, projectRoot ), kStaticDir, kAppPagesDir  ) );
	app.use( express.cookieParser( "your secret here" ) );
	app.use( express.session() );
	app.use( app.router );
	//app.use( express.static( path.join( __dirname, "Static" ) ) );
	app.use( express.static( kStaticDir ) );
} );

app.engine( ".swig", cons.swig );

swig.init({
    allowErrors: true, // allows errors to be thrown and caught by express instead of suppressed by Swig
    root : __dirname + "/AppPages"
});

app.configure( "development" , function() {
	app.use( express.errorHandler() );
} );

app.get( "/page1/page1.html.swig", function( req, res ) {
	res.render( kAppPagesDir + "/page1/page1.html.swig" );
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
