var cartero = require( '../index' );
var path = require( 'path' );
var test = require( 'tape' );
var fs = require( 'fs' );
var crypto = require( 'crypto' );
var _ = require( 'underscore' );
var cssPostProcessorStream = require('./css-post-processor-stream.js');

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

		packageMap[ newPackage.path.slice(1) ] = newPackage.id;
	} );

	c.on( 'done', function() {
		t.deepEqual(
			fs.readdirSync( outputDirPath ).sort(),
			[ packageId ].concat( outputDirFiles ).sort()
		);

		t.deepEqual( JSON.parse( fs.readFileSync( path.join( outputDirPath, 'metaData.json' ), 'utf8' ) ).packageMap, packageMap );

		t.deepEqual(
			fs.readdirSync( path.join( outputDirPath, packageId ) ).sort(),
			[ 'page1_bundle_9238125c90e5cfc790e8a5ac8926185dfb162b8c.css', 'page1_bundle_08786d2274344b392803ce9659e6d469ede96834.js' ].sort()
		);

		t.deepEqual( fs.readFileSync( path.join( outputDirPath, packageId, 'page1_bundle_9238125c90e5cfc790e8a5ac8926185dfb162b8c.css' ), 'utf8' ),
			'body {\n\tcolor : blue;\n}body {\n\tcolor : red;\n}body {\n\tcolor: #00FF00;\n}' );
	} );
} );

test( 'example2', function( t ) {
	t.plan( 3 );

	var entryPoint = path.join( __dirname, 'example2/views/page1/*.js' );
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

	var c = cartero( entryPoint, outputDirPath, options );
	var packageMap = {};

	c.on( 'packageCreated', function( newPackage ) {
		if( newPackage.isParcel ) {
			parcelId = newPackage.id;
		}

		packageMap[ newPackage.path.slice(1) ] = newPackage.id;
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
			[ path.relative( bundleDir, bundles.style ), path.relative( bundleDir, bundles.script ) ].sort()
		);
	} );
} );


test( 'example3', function( t ) {
	t.plan( 10 );

	var entryPoints = [ path.join( __dirname, 'example3/views/**/*' ) ];
	var entryPointFilter = function( fileName ) { return path.extname( fileName ) === '.js'; };
	var outputDirPath = path.join( __dirname, 'example3/static/assets' );
	var packageMap = {};
	var packageIds = [];
	var parcelIdsByPath = {};

	var commonJsPackageId = "";

	var c = cartero( entryPoints, outputDirPath, { entryPointFilter : entryPointFilter, assetTypes: [ 'random', 'style' ] } );

	c.on( 'packageCreated', function( newPackage ) {
		if( newPackage.package.name === "common-js" )
			commonJsPackageId = newPackage.id;

		if( newPackage.isParcel ) {
			var parcelId = newPackage.id;
			parcelIdsByPath[ path.relative( path.join( __dirname, 'example3/views' ), newPackage.path ) ] = parcelId;
		}

		packageMap[ newPackage.path.slice(1) ] = newPackage.id;

		packageIds.push( newPackage.id );
	} );

	c.on( 'done', function() {
		t.deepEqual(
			fs.readdirSync( outputDirPath ).sort(),
			packageIds.concat( outputDirFiles ).concat( [ 'common_39ebe84e9d92379be5bdf9b8d938b38677a1d620.js' ] ).sort()
		);

		_.each(_.values(JSON.parse( fs.readFileSync( path.join( outputDirPath, 'metaData.json' ), 'utf8' ) ).assetsRequiredByEntryPoint),
			function(el) {
				t.equal(_.contains(el.script, 'common_39ebe84e9d92379be5bdf9b8d938b38677a1d620.js'), true);
			});

		t.deepEqual( JSON.parse( fs.readFileSync( path.join( outputDirPath, 'metaData.json' ), 'utf8' ) ).packageMap, packageMap );

		var page1PackageFiles = fs.readdirSync( path.join( outputDirPath, parcelIdsByPath[ 'page1' ] ) ).sort();
		var page2PackageFiles = fs.readdirSync( path.join( outputDirPath, parcelIdsByPath[ 'page2' ] ) ).sort();

		var page1JsBundle = _.find( page1PackageFiles, function( thisFile ) { return path.extname( thisFile ) === '.js'; } );
		page1JsBundle = path.join( outputDirPath, parcelIdsByPath[ 'page1' ], page1JsBundle );

		var page1JsContents = fs.readFileSync( page1JsBundle, 'utf8' );
		t.ok( page1JsContents.indexOf( '/' + commonJsPackageId + '/robot_9018f21e83ce46f3ea2e3b73e5d75ece75407df7.png' ) !== -1, '##asset_url resolved' );

		var page1CssBundle = _.find( page1PackageFiles, function( thisFile ) { return path.extname( thisFile ) === '.css'; } );
		page1CssBundle = path.join( outputDirPath, parcelIdsByPath[ 'page1' ], page1CssBundle );

		var page1CssContents = fs.readFileSync( page1CssBundle, 'utf8' );
		t.ok( page1CssContents.indexOf( '/' + commonJsPackageId + '/robot_9018f21e83ce46f3ea2e3b73e5d75ece75407df7.png' ) !== -1, 'relative css url resolved' );
		t.ok( page1CssContents.indexOf( 'background : blue' ) !== -1, 'page 1 has correct background color' );

		var page2CssBundle = _.find( page2PackageFiles, function( thisFile ) { return path.extname( thisFile ) === '.css'; } );
		page2CssBundle = path.join( outputDirPath, parcelIdsByPath[ 'page2' ], page2CssBundle );

		var page2CssContents = fs.readFileSync( page2CssBundle, 'utf8' );
		t.ok( page2CssContents.indexOf( 'background : black' ) !== -1, 'page 2 has correct background color' );

		t.ok( _.contains(
			fs.readdirSync( path.join( outputDirPath, commonJsPackageId ) ).sort(),
			'robot_9018f21e83ce46f3ea2e3b73e5d75ece75407df7.png'
		), 'robot.png in common package' );
	} );
} );


test( 'example4', function( t ) {
	t.plan( 5 );

	var viewDirPath = path.join( __dirname, 'example4/views' );
	var outputDirPath = path.join( __dirname, 'example4/static/assets' );
	var packageId;
	var packagePath;
	var packageMap = {};

	var c = cartero( viewDirPath, outputDirPath, {} );

	c.on( 'packageCreated', function( newPackage ) {
		if( newPackage.isParcel ) {
			packageId = newPackage.id;
		}

		packagePath = newPackage.mainPath.slice(1);
		packageMap[ newPackage.path.slice(1) ] = newPackage.id;
	} );

	c.on( 'done', function() {
		// Cannot determine the exact name o the files due to the fact that we calculate the shasum after some transformation of the code
		// for more info check: https://github.com/rotundasoftware/cartero/pull/45
		//
		var metaData = require( path.join( outputDirPath, 'metaData.json' ) );
		var cssFile = path.relative(packageId, metaData.assetsRequiredByEntryPoint[ packagePath ].style[ 0 ]);
		var jsFile = path.relative(packageId, metaData.assetsRequiredByEntryPoint[ packagePath ].script[ 0 ]);
		var imgDir = 'img';
		var imgFile = 'robot_9018f21e83ce46f3ea2e3b73e5d75ece75407df7.png';

		t.ok( fs.existsSync( path.join( outputDirPath, packageId, imgDir, imgFile ) ), 'robot.png created with the new name' );

		t.deepEqual(
			fs.readdirSync( path.join( outputDirPath, packageId ) ).sort(),
			[ cssFile, jsFile, imgDir ].sort()
		);

		t.deepEqual(
			fs.readdirSync( path.join( outputDirPath, packageId, 'img') ),
			[ imgFile ]
		);

		// Test content of js file and check #asset_url
		var jsContent = fs.readFileSync( path.join( outputDirPath, packageId, jsFile ), 'utf8' );
		t.notEqual( jsContent.indexOf( 'var robotPngPath = \'/' + [ packageId, imgDir, imgFile ].join( '/' ) + '\';' ), -1 );

		t.equal( fs.readFileSync( path.join( outputDirPath, packageId, cssFile ), 'utf8' ),
			'body {\n\tbackground : blue url( \'../' + [ packageId, imgDir, imgFile ].join( '/' ) + '\' );\n}' );

	} );
} );


test( 'example5 – postProcessors', function( t ) {
	t.plan( 4 );

	var entryPoints = [ path.join( __dirname, 'example5/views/**/*' ) ];
	var entryPointFilter = function( fileName ) {
		return path.extname( fileName ) === '.js';
	};
	var outputDirPath = path.join( __dirname, 'example5/static/assets' );
	var packageMap = {};
	var packageIds = [];
	var parcelIdsByPath = {};
	var commonJsPackageId = '';
	var c = cartero(entryPoints, outputDirPath, {
		entryPointFilter: entryPointFilter,
		assetTypes: ['style'],
		postProcessors: [function(file) {
	    return cssPostProcessorStream(file);
		}]
	});

	c.on( 'packageCreated', function( newPackage ) {
		if( newPackage.package.name === "common-js" )
			commonJsPackageId = newPackage.id;

		if( newPackage.isParcel ) {
			var parcelId = newPackage.id;
			parcelIdsByPath[ path.relative( path.join( __dirname, 'example5/views' ), newPackage.path ) ] = parcelId;
		}

		packageMap[ newPackage.path.slice(1) ] = newPackage.id;
		packageIds.push( newPackage.id );
	} );

	c.on( 'done', function() {
		t.deepEqual(
			fs.readdirSync( outputDirPath ).sort(),
			packageIds.concat( outputDirFiles ).concat( [ 'common_39ebe84e9d92379be5bdf9b8d938b38677a1d620.js' ] ).sort()
		);

		t.deepEqual( JSON.parse( fs.readFileSync( path.join( outputDirPath, 'metaData.json' ), 'utf8' ) ).packageMap, packageMap );

		var page1PackageFiles = fs.readdirSync( path.join( outputDirPath, parcelIdsByPath[ 'page1' ] ) ).sort();
		var page2PackageFiles = fs.readdirSync( path.join( outputDirPath, parcelIdsByPath[ 'page2' ] ) ).sort();

		var page1CssBundle = _.find( page1PackageFiles, function( thisFile ) { return path.extname( thisFile ) === '.css'; } );
		page1CssBundle = path.join( outputDirPath, parcelIdsByPath[ 'page1' ], page1CssBundle );

		var page1CssContents = fs.readFileSync( page1CssBundle, 'utf8' );
		t.ok( page1CssContents.indexOf( 'background : blue' ) !== -1, 'page 1 has correct background color' );

		var page2CssBundle = _.find( page2PackageFiles, function( thisFile ) { return path.extname( thisFile ) === '.css'; } );
		page2CssBundle = path.join( outputDirPath, parcelIdsByPath[ 'page2' ], page2CssBundle );

		var page2CssContents = fs.readFileSync( page2CssBundle, 'utf8' );
		t.ok( page2CssContents.indexOf( 'background : black' ) !== -1, 'page 2 has correct background color' );
	} );
} );
