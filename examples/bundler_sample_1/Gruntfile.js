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
					preprocessingOptions : {
						sass : {

						}
					},
					minificationTasks : [
						{
							name : "htmlmin",
							suffixes : [ ".tmpl" ],
							options : {
								removeComments : true
							}
						},
						{
							name : "uglify",
							suffixes : [ ".js" ],
							options : {
								mangle : false
							}
						}
					]
				}
			}
		}
	} );

	grunt.loadNpmTasks( "grunt-contrib-copy" );
	grunt.loadNpmTasks( "grunt-contrib-clean" );
	grunt.loadNpmTasks( "grunt-contrib-sass");
	grunt.loadNpmTasks( "grunt-contrib-compass" );
	grunt.loadNpmTasks( "grunt-contrib-less");
	grunt.loadNpmTasks( "grunt-contrib-coffee");
	grunt.loadNpmTasks( "grunt-contrib-stylus");
	grunt.loadNpmTasks( "grunt-contrib-concat" );
	grunt.loadNpmTasks( "grunt-contrib-watch" );
	grunt.loadNpmTasks( "grunt-contrib-htmlmin" );
	grunt.loadNpmTasks( "grunt-contrib-uglify" );
	grunt.loadNpmTasks( "grunt-bundler" );

};
