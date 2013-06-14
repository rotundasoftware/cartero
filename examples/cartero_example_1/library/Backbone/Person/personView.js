
PersonView = Backbone.View.extend( {
	render : function() {
		var template = _.template( $( "script#person-template" ).html(), this.model.toJSON() );
		this.$el.html( template );
	}
} );