// Rotunda

(function() {
	var originalUnderscoreTemplateFunction = _.template;
	var templateHelpers = {};

	_.mixin({
		addTemplateHelpers : function( newHelpers ) {
			_.extend( templateHelpers, newHelpers );
		},

		template : function(text, data, settings) {
			// replace the built in _.template function with one that supports the addTemplateHelpers
			// function above. Basically the combo of the addTemplateHelpers function and this new
			// template function allows us to mix in global "helpers" to the data objects passed
			// to all our templates when they render. This replacement template function just wraps
			// the original _.template function, so it sould be pretty break-resistent moving forward.

			if( data )
			{
				// if data is supplied, the original _.template function just returns the raw value of the
				// render function (the final rentered html/text). So in this case we just extend
				// the data param with our templateHelpers and return raw value as well.

				_.defaults( data, templateHelpers ); // extend data with our helper functions
				return originalUnderscoreTemplateFunction.apply( this, arguments ); // pass the buck to the original _.template function
			}
			
			var template = originalUnderscoreTemplateFunction.apply( this, arguments );

			var wrappedTemplate = function( data ) {
				if( data ) _.defaults( data, templateHelpers );
				return template.apply( this, arguments );
			};

			return wrappedTemplate;
		},

		assertDefined : function() {
			// makes sure that each argument passed in (accessed through arguements) is in fact defined
			_.each( arguments, function( thisVariable ) {
				if( _.isUndefined( thisVariable ) ) throw "Required variable is undefined.";
			} );
		},

		isSubset : function( subsetArray, largerArray ) {
			var intersectionSize = _.intersection( subsetArray, largerArray ).length;
			return intersectionSize == subsetArray.length;
		},
		
		containSameElements : function( arrayA, arrayB ) {
			if( arrayA.length != arrayB.length ) return false;
			
			var intersectionSize = _.intersection( arrayA, arrayB ).length;
			return intersectionSize == arrayA.length; // and must also equal arrayB.length, since arrayA.length == arrayB.length
		},
		
		convertStringsToInts : function( theArray ) {
			return _.map( theArray, function( thisEl ) {
				if( ! _.isString( thisEl ) ) return thisEl;
				
				var thisElAsNumber = parseInt( thisEl, 10 );
				return( thisElAsNumber == thisEl ? thisElAsNumber : thisEl );
			} );
		},
		
		pluckMultiple : function( arrayOfObjects, keyArray ) {
			return _.map( arrayOfObjects, function( thisObject ) {
				return _.pick( thisObject, keyArray );
			} );
		}
	} );
})();