var myApp;

Ext.define('CustomApp', {
	extend: 'Rally.app.App',
	getSettingsFields: function() {
		return [
			{
				name: 'ignoreWindow',
				xtype: 'rallynumberfield',
				fieldLabel: 'Ignore artifacts created within the last X days:'
			}
		];
	},
	DARK_BROWN: '#4E1E1E',
	GREEN: '#58E481',
	RED: '#E63870',
	YELLOW: '#ffed78',
	FONT_SIZE: '15px',
	itemBacklog: [],
	conversationPostModel: null,
	
	launch: function() {
		myApp = this;
		
		// Fetch the conversation post model for later
		Rally.data.ModelFactory.getModel( {
			type: 'ConversationPost',
			success: myApp.launchPage,
			scope: myApp
		} );
	},
	
	launchPage:function( model ){
		myApp.conversationPostModel = model;
		myApp.clearContent();
		
		var header = myApp.add( {
			xype: 'container',
			border: 0,
			layout: {
				type: 'vbox',
				align: 'stretch'
			},
			bodyStyle: {
				'background-color': myApp.DARK_BROWN
			}
		});
		
		header.add( {
			xtype: 'label',
			html: 'It\'s time to review our backlog and vote to keep or sweep. You\'ll be presented with each item under consideration and asked whether we should keep it on the backlog or sweep it into the recycle bin. Your choices are tracked as comments on the artifact for later action.<br/>',
			style: {
				'font-size': myApp.FONT_SIZE,
				'color': '#FFFFFF'
			},
			padding: 10
		} );
		
		// Show loading message
		myApp._myMask = new Ext.LoadMask(Ext.getBody(), {msg:"Loading... Please wait."});
		myApp._myMask.show();
		
		myApp.loadItems( 'Defect' );
	},
	
	loadItems:function( model ) {
		var filters = [];
		
		if( myApp.getSetting( 'ignoreWindow' ) ) {
			var creationEndDate = new Date();
			creationEndDate.setDate( creationEndDate.getDate() - myApp.getSetting( 'ignoreWindow' ) );
			var toDateFilter = Ext.create('Rally.data.wsapi.Filter', {
				property : 'CreationDate',
				operator: '<',
				value: creationEndDate
			});
			filters.push( toDateFilter );
		}

		var scheduleStateFilter = Ext.create('Rally.data.wsapi.Filter', {
			property : 'ScheduleState',
			operator: '<=',
			value: 'Defined'
		});
		filters.push( scheduleStateFilter );

		var store = Ext.create(
			'Rally.data.wsapi.Store',
			{
				model: model,
				fetch: [
					'Discussion',
					'FormattedID',
					'Name',
					'CreationDate',
					'Description'
				],
				context: myApp.getContext().getDataContext(),
				pageSize: 2000,
				limit: 2000
			},
			myApp
		);

		store.addFilter( filters, false );
		// TODO: If there are over 2000 work items, we would need to fetch a second page (or more)
		store.loadPage( 1, {
			scope: myApp,
			callback: function( records, operation ) {
				if( operation.wasSuccessful() ) {
					myApp.itemBacklog = _.union( myApp.itemBacklog, _.pluck( records, 'data' ) );
					if( model === 'Defect' ) {
						myApp.loadItems( 'UserStory' );
					} else {
						myApp._myMask.hide();
						myApp.presentItem( 0 );
					}
				}
			}
		});
	},
	
	presentItem:function( itemIndex ) {
		if( itemIndex <= myApp.itemBacklog.length - 1 ) {
		
			var item = myApp.itemBacklog[ itemIndex ];
			myApp.addLabel( myApp, 'Item ' + ( itemIndex + 1 ) + ' of ' + myApp.itemBacklog.length );
			
			var buttonBox = myApp.add( {
				xype: 'container',
				border: 0,
				layout: {
					type: 'hbox',
					align: 'stretch'
				},
				padding: '10 0 10 0'
			});
			
			myApp.addButton( buttonBox, 'Keep', myApp.GREEN, function(){ myApp.processItem( itemIndex, true ); } );
			myApp.addButton( buttonBox, 'Sweep', myApp.RED, function(){ myApp.processItem( itemIndex, false ); } );
			myApp.addButton( buttonBox, 'Skip', myApp.YELLOW, function(){
				myApp.clearContent();
				myApp.presentItem( itemIndex + 1 );
			} );
			
			var descriptionBox = myApp.add( {
				xype: 'container',
				border: 0,
				layout: {
					type: 'vbox',
					align: 'stretch'
				}
			});
			
			myApp.addHeader( descriptionBox, 'ID');
			myApp.addLabel( descriptionBox, item.FormattedID );
			myApp.addHeader( descriptionBox, 'Name' );
			myApp.addLabel( descriptionBox, item.Name );
			myApp.addHeader( descriptionBox, 'Creation Date' );
			myApp.addLabel( descriptionBox, item.CreationDate.toLocaleString( 'en-US' ) );
			myApp.addHeader( descriptionBox, 'Description' );
			myApp.addLabel( descriptionBox, item.Description );
			
		} else {
			// TODO: Add something more fun here. Maybe a pie chart?
			myApp.addLabel( myApp, 'It\'s Over! Thanks for your votes.' );
		}
	},
	
	processItem:function( itemIndex, keep ) {
		var item = myApp.itemBacklog[ itemIndex ];
		myApp._myMask.show();
		
		var post = Ext.create( myApp.conversationPostModel, {
			Text: ( keep ? 'Keep it!' : 'Sweep it!' ) + '<br/>Powered by the Keep-or-Sweep app',
			Artifact: item._ref
		} );
		
		post.save( {
			callback: function( result, operation ){
				if ( operation.wasSuccessful() ) {
					myApp._myMask.hide();
					myApp.clearContent();
					myApp.presentItem( itemIndex + 1 );
				}
			}
		});
	},
	
	addLabel:function( parent, text ) {
		parent.add( {
			xtype: 'label',
			html: text,
			style: {
				'font-size': myApp.FONT_SIZE
			}
		} );
	},
	
	addHeader:function( parent, text ) {
		parent.add( {
			xtype: 'label',
			html: '<u><b>' + text + '</b></u>',
			style: {
				'font-size': myApp.FONT_SIZE,
				'color': myApp.DARK_BROWN
			},
			padding: '5 0 1 0'
		} );
	},
	
	addButton:function( parent, text, color, handler ) {
		var button = parent.add( {
			xtype: 'rallybutton',
			text: text,
			handler: handler,
			style: {
				'background-color': color,
				'border-color': color
			}
		} );
		button.getEl().down( '.x-btn-inner' ).setStyle( {
			'color':myApp.DARK_BROWN,
			'font-size': myApp.FONT_SIZE
		} );
	},
	
	clearContent:function() {
		while( myApp.down( 'label' ) ) {
			myApp.down( 'label' ).destroy();
		}
		while( myApp.down( 'button' ) ) {
			myApp.down( 'button' ).destroy();
		}
		while( myApp.down( 'container' ) ) {
			myApp.down( 'container' ).destroy();
		}
	}
});