module.exports = function( grunt ) {

	grunt.initConfig( {
		cartero : {
			options : {
				library : {
					path : "App/node_modules",
					directoriesToFlatten : /^_.*/,
					childrenDependOnParents : true
				},
				views : {
					path : "App/WebServer/AppPages",
					filesToIgnore : /^_.*/,
					directoriesToIgnore : /^__.*/,
					viewFileExt : ".swig",
					namespace : "MainViewDir"
				},
				publicDir : "App/WebServer/Static",
				projectDir : __dirname,
				tmplExt : ".tmpl",
				browserify : true,
				minificationTasks : [
					{
						name : "htmlmin",
						inExt : ".html",
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
					mode : "dev",
				}
			},
			prod : {
				options : {
					mode : "prod",
				}
			}
		}
	} );

	grunt.loadNpmTasks( "grunt-contrib-htmlmin" );
	grunt.loadNpmTasks( "grunt-contrib-uglify" );
	grunt.loadNpmTasks( "grunt-contrib-watch" );
	grunt.loadNpmTasks( "cartero" );

};
