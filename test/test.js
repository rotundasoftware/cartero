var os = require( 'os' );
var cartero = require( '../index' );
var path = require( 'path' );
var test = require( 'tape' );
var fs = require( 'fs' );
var crypto = require( 'crypto' );
var _ = require( 'underscore' );

var outputDirFiles = [ "package_map.json", "view_map.json" ];

test( 'example1', function( t ) {
	t.plan( 4 );

	var viewDirPath = path.join( __dirname, 'example1/views' );
	var outputDirPath = path.join( __dirname, 'example1/static/assets' );
	var packageId, viewRelativePathHash;

	var c = cartero( viewDirPath, outputDirPath, {} );

	c.on( 'packageCreated', function( newPackage, isMain ) {
		if( isMain ) {
			packageId = newPackage.id;
			viewRelativePathHash = crypto.createHash( 'sha1' ).update( path.relative( viewDirPath, newPackage.view ) ).digest( 'hex' );
		}
	} );

	c.on( 'done', function() {
		t.deepEqual(
			fs.readdirSync( outputDirPath ).sort(),
			[ packageId ].concat( outputDirFiles ).sort()
		);

		t.deepEqual( fs.readFileSync( path.join( outputDirPath, 'view_map.json' ), 'utf8' ), '{\n    \"' + viewRelativePathHash + '\": \"' + packageId +'\"\n}' );
	
		t.deepEqual(
			fs.readdirSync( path.join( outputDirPath, packageId ) ).sort(),
			[ 'assets.json', 'page1_bundle_9238125c90e5cfc790e8a5ac8926185dfb162b8c.css', 'page1_bundle_d4d3df760297139ea6f4ec7b2296537fe86efe67.js' ]
		);

		t.deepEqual( fs.readFileSync( path.join( outputDirPath, packageId, 'page1_bundle_9238125c90e5cfc790e8a5ac8926185dfb162b8c.css' ), 'utf8' ),
			'body {\n\tcolor : blue;\n}body {\n\tcolor : red;\n}body {\n\tcolor: #00FF00;\n}' );
	} );
} );

test( 'example2', function( t ) {
	t.plan( 3 );

	var viewDirPath = path.join( __dirname, 'example2/views' );
	var outputDirPath = path.join( __dirname, 'example2/static/assets' );
	var parcelId, viewRelativePathHash;

	var options = {
		packageTransform : function( pkg ) {
			_.defaults( pkg, {
				'style' : '*.css',
				'browserify' : {
					'transform' : [ 'browserify-shim' ]
				}
			} );

			switch( pkg.name ) {
				case 'jqueryui-browser':
					pkg.main = 'ui/jquery-ui.js';
					pkg.style = [ './themes/base/jquery-ui.css' ];
					break;
			}

			return pkg;
		}
	};

	var c = cartero( viewDirPath, outputDirPath, options );

	c.on( 'packageCreated', function( newPackage, isMain ) {
		if( isMain ) {
			parcelId = newPackage.id;
			viewRelativePathHash = crypto.createHash( 'sha1' ).update( path.relative( viewDirPath, newPackage.view ) ).digest( 'hex' );
		}
	} );

	var bundles = {};

	c.on( 'fileWritten', function( path, type, isBundle ) {
		if( isBundle )
			bundles[ type ] = path;
	} );

	c.on( 'done', function() {
		t.deepEqual(
			fs.readdirSync( outputDirPath ).sort(),
			[ parcelId ].concat( outputDirFiles ).sort()
		);

		t.deepEqual( fs.readFileSync( path.join( outputDirPath, 'view_map.json' ), 'utf8' ), '{\n    \"' + viewRelativePathHash + '\": \"' + parcelId + '\"\n}' );

		var bundleDir = path.join( outputDirPath, parcelId );
		t.deepEqual(
			fs.readdirSync( bundleDir ).sort(),
			[ 'assets.json', path.relative( bundleDir, bundles.style ), path.relative( bundleDir, bundles.script ) ]
		);
	} );
} );


test( 'example3', function( t ) {
	t.plan( 7 );

	var viewDirPath = path.join( __dirname, 'example3/views' );
	var outputDirPath = path.join( __dirname, 'example3/static/assets' );
	var viewMap = {};
	var packageIds = [];
	var parcelIdsByView = {};

	var commonJsPackageId = "";

	var c = cartero( viewDirPath, outputDirPath, {} );

	c.on( 'packageCreated', function( newPackage, isMain ) {
		if( isMain ) {
			parcelId = newPackage.id;
			viewMap[ crypto.createHash( 'sha1' ).update( path.relative( viewDirPath, newPackage.view ) ).digest( 'hex' ) ] = parcelId;
			parcelIdsByView[ path.basename( newPackage.view ) ] = parcelId;
		}
		else
			if( newPackage.package.name === "common-js" )
				commonJsPackageId = newPackage.id;

		packageIds.push( newPackage.id );
	} );

	c.on( 'done', function() {
		t.deepEqual(
			fs.readdirSync( outputDirPath ).sort(),
			packageIds.concat( outputDirFiles ).sort()
		);

		t.deepEqual( JSON.parse( fs.readFileSync( path.join( outputDirPath, 'view_map.json' ), 'utf8' ) ), viewMap );
	
		var page1PackageFiles = fs.readdirSync( path.join( outputDirPath, parcelIdsByView[ 'page1.jade' ] ) ).sort();
		t.deepEqual(
			page1PackageFiles,
			[ 'assets.json', 'page1_bundle_80161965675b6de03148f51c413205af9bb9ce04.css', 'page1_bundle_abb101ae3675f0054d6cb0ef1539d0e5e632cc7f.js' ].sort()
		);

		var page1JsBundle = _.find( page1PackageFiles, function( thisFile ) { return path.extname( thisFile ) === '.js'; } );
		page1JsBundle = path.join( outputDirPath, parcelIdsByView[ 'page1.jade' ], page1JsBundle );

		var page1JsContents = fs.readFileSync( page1JsBundle, 'utf8' );
		t.ok( page1JsContents.indexOf( '/' + commonJsPackageId + '/robot.png' ) !== -1, '##asset_url resolved' );
		
		var page1CssBundle = _.find( page1PackageFiles, function( thisFile ) { return path.extname( thisFile ) === '.css'; } );
		page1CssBundle = path.join( outputDirPath, parcelIdsByView[ 'page1.jade' ], page1CssBundle );

		var page1CssContents = fs.readFileSync( page1CssBundle, 'utf8' );
		t.ok( page1CssContents.indexOf( '/' + commonJsPackageId + '/robot.png' ) !== -1, 'relative css url resolved' );

		t.deepEqual(
			fs.readdirSync( path.join( outputDirPath, parcelIdsByView[ 'page2.jade' ] ) ).sort(),
			[ 'assets.json', 'page2_bundle_59fbd6d0992e406a658dcc7abe4f0caffdbb4912.css', 'page2_bundle_5066f9594b8be17fd6360e23df52ffe750206020.js' ].sort()
		);

		t.deepEqual(
			fs.readdirSync( path.join( outputDirPath, commonJsPackageId ) ).sort(),
			[ 'robot.png' ]
		);
	} );
} );


