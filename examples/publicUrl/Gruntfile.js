module.exports = function( grunt ) {

	grunt.initConfig( {
		cartero : {
			options : {
				projectDir : __dirname,
				publicDir : "static",
				publicUrl : "/some-url-prefix",
				tmplExt : [ ".tmpl" ],
				library : [
					{
						path : "library"
					}
				],
				views : [
					{
						path : "views",
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
	grunt.loadNpmTasks( "grunt-contrib-less");
	grunt.loadNpmTasks( "grunt-contrib-coffee");
	grunt.loadNpmTasks( "grunt-contrib-stylus");
	grunt.loadNpmTasks( "grunt-contrib-watch" );
	grunt.loadNpmTasks( "cartero" );

};
