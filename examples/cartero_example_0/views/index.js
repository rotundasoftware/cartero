
$( function() {
	var numberOfPeriods = 0;
	animate();
	
	function animate() {

		var text = "Hello World";
		for( i = 0; i < numberOfPeriods; i ++ ) text += ".";

		$( "h1" ).text( text );

		numberOfPeriods++;
		if( numberOfPeriods == 4 ) numberOfPeriods = 0;

		_.delay( animate, 1000 );
	}
} );