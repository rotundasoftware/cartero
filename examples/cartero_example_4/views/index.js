var numberOfPeriods = 0;
animate();

function animate() {
		var text = "Hello World";
		for( i = 0; i < numberOfPeriods; i ++ ) text += ".";

		document.getElementsByTagName( "h1" )[0].innerHTML = text;

		numberOfPeriods++;
		if( numberOfPeriods == 4 ) numberOfPeriods = 0;

		setTimeout( animate, 1000 );
}
