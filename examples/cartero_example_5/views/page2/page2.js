$(document).ready( function() {
	if( _.isUndefined( _.string ) )
		throw new Error( "_s was not available");

	var string1 = "this is my string";

	if( _.string.endsWith( string1, "string" ) )
		console.log( "string1 ends with string" );
	else
		console.log( "string1 does not end with string" );

} );
