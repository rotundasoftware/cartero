module.exports = function( grunt ) {

	grunt.initConfig( {
		cartero : {
			options : {
				projectDir : __dirname,
				publicDir : "static",
				tmplExt : [ ".tmpl" ],
				library : [ {
					path : "library"
				} ],
				views : [ {
					path : "views",
					viewFileExt : ".jade"
				} ],
				preprocessingTasks : [ {
					name : "sass",
					inExt : ".scss",
					outExt : ".css"
				} ],
				mode : "dev"
			},
			dev : {
				options : {}
			},
			prod : {
				options : {
					mode : "prod"
				}
			}
		}
	} );

	grunt.loadNpmTasks( "grunt-contrib-sass");
	grunt.loadNpmTasks( "grunt-contrib-watch" );
	grunt.loadNpmTasks( "grunt-cartero" );
};
