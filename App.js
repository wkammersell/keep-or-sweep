var myApp;

Ext.define('CustomApp', {
	extend: 'Rally.app.App',
	getSettingsFields: function() {
		return [
			{
				name: 'ignoreWindow',
				xtype: 'rallynumberfield',
				fieldLabel: 'Ignore artifacts created within the last X days:'
			},
			{
				name: 'revoteWindow',
				xtype: 'rallynumberfield',
				fieldLabel: 'Ignore votes within the last X days:'
			}
		];
	},
	DARK_BROWN: '#4E1E1E',
	GREEN: '#58E481',
	RED: '#E63870',
	YELLOW: '#ffed78',
	FONT_SIZE: '15px',
	POWERED_BY_MESSAGE: 'Powered by the Keep-or-Sweep app',
	itemBacklog: [],
	voteNeeds: [],
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
				sorters: [
					{
						property: 'CreationDate',
						direction: 'ASC'
					}
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
					myApp.itemBacklog = records;
					
					if( model === 'Defect' ) {
						myApp.loadItems( 'UserStory' );
					} else {
						myApp.loadConversationPosts( 0 );
					}
				}
			}
		});
	},
	
	// Load the Conversations for each item to get the votes
	loadConversationPosts:function( itemIndex ) {
		if( itemIndex <= myApp.itemBacklog.length - 1 ) {
			var workItem = myApp.itemBacklog[ itemIndex ];
			workItem.getCollection( 'Discussion' ).load( {
				fetch: [ 'User', 'Text', 'CreationDate' ],
				callback: function( conversationPostRecords, operation ) {
					if( operation.wasSuccessful() ) {
						workItem.ConversationPosts = conversationPostRecords;
					}
					myApp.loadConversationPosts( itemIndex + 1 );
				}
			} );
		}  else {
			myApp.identifyVoteNeeds();
		}
	},
	
	identifyVoteNeeds:function() {
		var myUserRefObjectUUID = myApp.getContext().getUser()._refObjectUUID;
		var cutOffDate = new Date();
		if ( myApp.getSetting( 'revoteWindow' ) ) {
			cutOffDate.setDate( cutOffDate.getDate() - myApp.getSetting( 'revoteWindow' ) );
		}
		
		_.each( myApp.itemBacklog, function( item ) {
			item.needsVote = _.find( item.ConversationPosts, function( post ) {
				var isMyComment = post.data.User._refObjectUUID == myUserRefObjectUUID;
				var isRecentComment = post.data.CreationDate <= cutOffDate;
				var isKeepOrSweepComment = post.data.Text.includes( myApp.POWERED_BY_MESSAGE );
				return isMyComment && isRecentComment && isKeepOrSweepComment;
			} ) === undefined ? true : false;
		}, myApp );
		
		myApp.voteNeeds = _.where( myApp.itemBacklog, { needsVote: true } );
		myApp._myMask.hide();
		myApp.presentItemVote( 0 );
	},
	
	presentItemVote:function( itemIndex ) {
		if( itemIndex <= myApp.voteNeeds.length - 1 ) {
		
			var item = myApp.voteNeeds[ itemIndex ].data;
			myApp.addLabel( myApp, 'Item ' + ( itemIndex + 1 ) + ' of ' + myApp.voteNeeds.length );
			
			var buttonBox = myApp.add( {
				xype: 'container',
				border: 0,
				layout: {
					type: 'hbox',
					align: 'stretch'
				},
				padding: '10 0 10 0'
			});
			
			myApp.addButton( buttonBox, 'Keep', myApp.GREEN, function(){ myApp.voteItem( itemIndex, true ); } );
			myApp.addButton( buttonBox, 'Sweep', myApp.RED, function(){ myApp.voteItem( itemIndex, false ); } );
			myApp.addButton( buttonBox, 'Skip', myApp.YELLOW, function(){
				myApp.clearContent();
				myApp.presentItemVote( itemIndex + 1 );
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
	
	voteItem:function( itemIndex, keep ) {
		var item = myApp.voteNeeds[ itemIndex ];
		myApp._myMask.show();
		
		var post = Ext.create( myApp.conversationPostModel, {
			Text: ( keep ? 'Keep it!' : 'Sweep it!' ) + '<br/>' + myApp.POWERED_BY_MESSAGE,
			Artifact: item._ref
		} );
		
		post.save( {
			callback: function( result, operation ){
				if ( operation.wasSuccessful() ) {
					myApp._myMask.hide();
					myApp.clearContent();
					myApp.presentItemVote( itemIndex + 1 );
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