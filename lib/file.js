function File() {

}

File.prototype = {

	toString : function() {
		return this.path + "|" + this.type + "|" + this.keepSeparate + "|" + _.pluck( this.combinedFiles, "path" );
	},

	getFileType : function() {
		return this.path.substring( this.path.lastIndexOf( "." ) + 1 );
	}

};

module.exports = File;