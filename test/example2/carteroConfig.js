
_ = require( 'underscore' );

module.exports = {
	"packageTransform" : function( pkg ) {
		_.defaults( pkg, {
			'style' : '*.css'
		} );

		switch( pkg.name ) {
			case 'jqueryui-browser':
				pkg.main = './ui/jquery-ui.js';
				pkg.style = [ './themes/base/jquery-ui.css' ];
				break;
		}

		return pkg;
	}
};