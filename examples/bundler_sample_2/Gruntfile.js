//var _ = require( "underscore" ),
//	_s = require( "underscore.string" ),
//	path = require( "path" ),
	//assetManager = require( "./WebServer/Libraries/assetManager.js" );
//	assetManager = require( "assetManager.js" );

module.exports = function( grunt ) {

	grunt.initConfig( {
		assetbundler : {
			options : {
				mode : "prod",
				assetLibrary : {
					//srcDir : "AssetLibrary/",
					//destDir : "WebServer/Static/AssetLibrary-assets/"
					//destDir : "WebServer/Static/node_modules/"
					srcDir : "App/node_modules/",
					destDir : "App/WebServer/Static/AssetLibrary-assets/"
				},
				appPages : {
					//srcDir : "WebServer/AppPages/",
					//destDir : "WebServer/Static/AppPages-assets/",
					srcDir : "App/WebServer/AppPages/",
					destDir : "App/WebServer/Static/AppPages-assets/",
					filesToIgnore : /_.*/,
					directoriesToIgnore : /__.*/
				},
				staticDir : "App/WebServer/Static/",
				rootDir : __dirname,
				serverSideTemplateSuffix : ".swig",
				useDirectoriesForDependencies : true,
				requirify : true/*,
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
				]*/
			}//,
		//dist : {
		//	mode : "prod"
		//}
			//dist : {
//
//			}

		},

		requirify : {
			dist : {
				options : {
					nodePaths : [ "WebServer/Static/AssetLibrary-assets/" ]
				},
				files : [
					{
						src : "WebServer/Static/AssetLibrary-assets/**/*.js"
					},
					{
						src : "WebServer/Static/AppPages-assets/**/*.js"
					}
				]
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
	grunt.loadNpmTasks( "grunt-asset-bundler" );

};
