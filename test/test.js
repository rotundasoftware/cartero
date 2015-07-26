var cartero = require( '../index' );
var path = require( 'path' );
var test = require( 'tape' );
var fs = require( 'fs' );
var crypto = require( 'crypto' );
var _ = require( 'underscore' );

var outputDirFiles = [ 'metaData.json' ];

test( 'example1', function( t ) {
	t.plan( 4 );

	var viewDirPath = path.join( __dirname, 'example1/views' );
	var outputDirPath = path.join( __dirname, 'example1/static/assets' );
	var packageId;
	var packageMap = {};

	var c = cartero( viewDirPath, outputDirPath, {} );

	c.on( 'packageCreated', function( newPackage ) {
		if( newPackage.isParcel ) {
			packageId = newPackage.id;
		}

		packageMap[ newPackage.path ] = newPackage.id;
	} );

	c.on( 'done', function() {
		t.deepEqual(
			fs.readdirSync( outputDirPath ).sort(),
			[ packageId ].concat( outputDirFiles ).sort()
		);

		t.deepEqual( JSON.parse( fs.readFileSync( path.join( outputDirPath, 'metaData.json' ), 'utf8' ) ).packageMap, packageMap );
	
		t.deepEqual(
			fs.readdirSync( path.join( outputDirPath, packageId ) ).sort(),
			[ 'assets.json', 'page1_bundle_9238125c90e5cfc790e8a5ac8926185dfb162b8c.css', 'page1_bundle_123cb7749e42a2fddd194619be709bc3a18c7965.js' ].sort()
		);

		t.deepEqual( fs.readFileSync( path.join( outputDirPath, packageId, 'page1_bundle_9238125c90e5cfc790e8a5ac8926185dfb162b8c.css' ), 'utf8' ),
			'body {\n\tcolor : blue;\n}body {\n\tcolor : red;\n}body {\n\tcolor: #00FF00;\n}' );
	} );
} );

test( 'example2', function( t ) {
	t.plan( 3 );

	var viewDirPath = path.join( __dirname, 'example2/views' );
	var outputDirPath = path.join( __dirname, 'example2/static/assets' );
	var parcelId;

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
	var packageMap = {};

	c.on( 'packageCreated', function( newPackage ) {
		if( newPackage.isParcel ) {
			parcelId = newPackage.id;
		}

		packageMap[ newPackage.path ] = newPackage.id;
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

		t.deepEqual( JSON.parse( fs.readFileSync( path.join( outputDirPath, 'metaData.json' ), 'utf8' ) ).packageMap, packageMap );

		var bundleDir = path.join( outputDirPath, parcelId );
		t.deepEqual(
			fs.readdirSync( bundleDir ).sort(),
			[ 'assets.json', path.relative( bundleDir, bundles.style ), path.relative( bundleDir, bundles.script ) ].sort()
		);
	} );
} );


test( 'example3', function( t ) {
	t.plan( 7 );

	var viewDirPath = path.join( __dirname, 'example3/views' );
	var outputDirPath = path.join( __dirname, 'example3/static/assets' );
	var packageMap = {};
	var packageIds = [];
	var parcelIdsByPath = {};

	var commonJsPackageId = "";

	var c = cartero( viewDirPath, outputDirPath, { assetTypes: [ 'random', 'style' ] } );

	c.on( 'packageCreated', function( newPackage ) {
		if( newPackage.package.name === "common-js" )
			commonJsPackageId = newPackage.id;

		if( newPackage.isParcel ) {
			var parcelId = newPackage.id;
			parcelIdsByPath[ path.relative( viewDirPath, newPackage.path ) ] = parcelId;
		}

		packageMap[ newPackage.path ] = newPackage.id;

		packageIds.push( newPackage.id );
	} );

	c.on( 'done', function() {
		t.deepEqual(
			fs.readdirSync( outputDirPath ).sort(),
			packageIds.concat( outputDirFiles ).sort()
		);

		t.deepEqual( JSON.parse( fs.readFileSync( path.join( outputDirPath, 'metaData.json' ), 'utf8' ) ).packageMap, packageMap );
	
		var page1PackageFiles = fs.readdirSync( path.join( outputDirPath, parcelIdsByPath[ 'page1' ] ) ).sort();
		var page2PackageFiles = fs.readdirSync( path.join( outputDirPath, parcelIdsByPath[ 'page2' ] ) ).sort();

		var page1JsBundle = _.find( page1PackageFiles, function( thisFile ) { return path.extname( thisFile ) === '.js'; } );
		page1JsBundle = path.join( outputDirPath, parcelIdsByPath[ 'page1' ], page1JsBundle );

		var page1JsContents = fs.readFileSync( page1JsBundle, 'utf8' );
		t.ok( page1JsContents.indexOf( '/' + commonJsPackageId + '/robot.png' ) !== -1, '##asset_url resolved' );
		
		var page1CssBundle = _.find( page1PackageFiles, function( thisFile ) { return path.extname( thisFile ) === '.css'; } );
		page1CssBundle = path.join( outputDirPath, parcelIdsByPath[ 'page1' ], page1CssBundle );

		var page1CssContents = fs.readFileSync( page1CssBundle, 'utf8' );
		t.ok( page1CssContents.indexOf( '/' + commonJsPackageId + '/robot.png' ) !== -1, 'relative css url resolved' );
		t.ok( page1CssContents.indexOf( 'background : blue' ) !== -1, 'page 1 has correct background color' );

		var page2CssBundle = _.find( page2PackageFiles, function( thisFile ) { return path.extname( thisFile ) === '.css'; } );
		page2CssBundle = path.join( outputDirPath, parcelIdsByPath[ 'page2' ], page2CssBundle );

		var page2CssContents = fs.readFileSync( page2CssBundle, 'utf8' );
		t.ok( page2CssContents.indexOf( 'background : black' ) !== -1, 'page 2 has correct background color' );

		t.ok( _.contains(
			fs.readdirSync( path.join( outputDirPath, commonJsPackageId ) ).sort(),
			'robot.png'
		), 'robot.png in common package' );
	} );
} );


