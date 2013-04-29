//var _ = require( "underscore" ),
//	_s = require( "underscore.string" ),
//	path = require( "path" ),
	//assetManager = require( "./WebServer/Libraries/assetManager.js" );
//	assetManager = require( "assetManager.js" );

module.exports = function( grunt ) {

	grunt.initConfig( {

		bundler : {
			dist : {
				options : {
					mode : "dev",
					assetLibrarySrc : "AssetLibrary/",
					assetLibraryDest : "WebServer/Static/AssetLibrary-assets/",
					appPagesSrc : "WebServer/AppPages/",
					appPagesDest : "WebServer/Static/AppPages-assets/",
					tasksToRun : [ "" ]
				}
			}
		}
	} );

	grunt.loadNpmTasks( "grunt-contrib-copy" );
	grunt.loadNpmTasks( "grunt-contrib-clean" );
	grunt.loadNpmTasks( "grunt-contrib-sass");
	grunt.loadNpmTasks( "grunt-contrib-concat" );
	grunt.loadNpmTasks( "grunt-contrib-watch" );
	grunt.loadNpmTasks( "grunt-bundler" );


};
