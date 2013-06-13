//var _ = require( "underscore" ),
//	_s = require( "underscore.string" ),
//	path = require( "path" ),
	//assetManager = require( "./WebServer/Libraries/assetManager.js" );
//	assetManager = require( "assetManager.js" );

module.exports = function( grunt ) {

	grunt.initConfig( {
		cartero : {
			options : {
				projectDir : __dirname,
				library : [
					{
						path : "library",
						namespace : "Main",
						bundleProperties : grunt.file.readJSON( "libraryBundleProperties.json" )
					},
					{
						path : "components",
						namespace : "Bower",
						directoriesToFlatten : /.*/,
						bundleProperties : grunt.file.readJSON( "bowerBundleProperties.json" )
					}
				],
				views : [
					{
						path : "views",
						filesToIgnore : /_.*/,
						directoriesToIgnore : /__.*/,
						viewFileExt : ".swig"
					}
				],
				preprocessingTasks : [
					{
						name : "coffee",
						inExt : ".coffee",
						outExt : ".js"
					},
					{
						name : "sass",
						inExt : ".scss",
						outExt : ".css"
					},
					{
						name : "stylus",
						inExt : ".styl",
						outExt : ".css"
					},
					{
						name : "less",
						inExt : ".less",
						outExt : ".css"
					}
				],
				publicDir : "static",
				tmplExt : [ ".tmpl", ".tmpl2" ],
				minificationTasks : [
					{
						name : "htmlmin",
						inExt : ".tmpl",
						options : {
							removeComments : true
						}
					},
					{
						name : "uglify",
						inExt : ".js",
						options : {
							mangle : false
						}
					}
				]
			},
			dev : {
				options : {
					mode : "dev"
				}
			},
			prod : {
				options : {
					mode : "prod"
				}
			}
		}
	} );

	grunt.loadNpmTasks( "grunt-contrib-sass");
	grunt.loadNpmTasks( "grunt-contrib-compass" );
	grunt.loadNpmTasks( "grunt-contrib-sass" );
	grunt.loadNpmTasks( "grunt-contrib-less");
	grunt.loadNpmTasks( "grunt-contrib-coffee");
	grunt.loadNpmTasks( "grunt-contrib-stylus");
	grunt.loadNpmTasks( "grunt-contrib-watch" );
	grunt.loadNpmTasks( "grunt-contrib-htmlmin" );
	grunt.loadNpmTasks( "grunt-contrib-uglify" );
	grunt.loadNpmTasks( "grunt-cartero" );

};
