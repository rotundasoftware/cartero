/**
 * @license Copyright (c) 2003-2013, CKSource - Frederico Knabben. All rights reserved.
 * For licensing, see LICENSE.html or http://ckeditor.com/license
 */

CKEDITOR.editorConfig = function( config ) {
	// Define changes to default configuration here.
	// For the complete reference:
	// http://docs.ckeditor.com/#!/api/CKEDITOR.config

	// The toolbar groups arrangement, optimized for a single toolbar row.
	config.toolbarGroups = [
		{ name: 'document',	   groups: [ 'mode', 'document', 'doctools' ] },
		// On the basic preset, clipboard and undo is handled by keyboard.
		// Uncomment the following line to enable them on the toolbar as well.
		// { name: 'clipboard',   groups: [ 'clipboard', 'undo' ] },
		{ name: 'editing',     groups: [ 'find', 'selection', 'spellchecker' ] },
		{ name: 'forms' },
		{ name: 'basicstyles', groups: [ 'basicstyles', 'cleanup' ] },
		{ name: 'paragraph',   groups: [ 'list', 'indent', 'blocks', 'align' ] },
		{ name: 'links' },
		{ name: 'insert' },
		{ name: 'styles' },
		{ name: 'colors' },
		{ name: 'tools' },
		{ name: 'others' },
		{ name: 'about' }
	];

	config.toolbar = [
	    ['Bold', 'Italic', 'Underline', '-', 'TextColor', 'BGColor', '-', 'Link', 'Unlink', 'Font', 'FontSize', 'NumberedList', 'BulletedList', 'Indent', 'Outdent' ]
	];

	config.fontSize_sizes = '10/10px;12/12px;16/16px;24/24px;48/48px;';

	config.tabSpaces = 4;

	// The default plugins included in the basic setup define some buttons that
	// we don't want too have in a basic editor. We remove them here.
	config.removeButtons = 'Anchor,Strike,Subscript,Superscript';

	// Considering that the basic setup doesn't provide pasting cleanup features,
	// it's recommended to force everything to be plain text.
	config.forcePasteAsPlainText = true;

	// Let's have it basic on dialogs as well.
	config.removeDialogTabs = 'link:advanced';
};

CKEDITOR.on( 'dialogDefinition', function( ev )
{
  // Take the dialog name and its definition from the event data.
  var dialogName = ev.data.name;
  var dialogDefinition = ev.data.definition;

  // Check if the definition is from the dialog we're
  // interested in (the 'link' dialog).
  if ( dialogName == 'link' )
  {
     // Remove the 'Target' and 'Advanced' tabs from the 'Link' dialog.
     dialogDefinition.removeContents( 'target' );
     dialogDefinition.removeContents( 'advanced' );

     // Get a reference to the 'Link Info' tab.
     var infoTab = dialogDefinition.getContents( 'info' );

     // Remove unnecessary widgets from the 'Link Info' tab.         
     infoTab.remove( 'linkType');
     infoTab.remove( 'protocol');
  }
});