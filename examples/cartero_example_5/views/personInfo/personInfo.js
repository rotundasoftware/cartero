$(document).ready( function() {

	var mailmanModel = new Person();

	mailmanModel.set( { firstName : "Mailman", lastName : "Cartero" } );

	var mailmanView = new PersonView( {
		el : $( "div#personContainer" ),
		model : mailmanModel
	} );

	mailmanView.render();

} );