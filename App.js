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
	WHITE: '#FFFFFF',
	FONT_SIZE: '15px',
	POWERED_BY_MESSAGE: 'Powered by the Keep-or-Sweep app',
	KEEP_MESSAGE: 'Keep It!',
	SWEEP_MESSAGE: 'Sweep It!',
	itemBacklog: [],
	conversationPostModel: null,
	
	launch: function() {
		myApp = this;
		
		myApp._myMask = new Ext.LoadMask(Ext.getBody(), {msg:"Loading... Please wait."});
		myApp._myMask.show();
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
			},
		});
		
		var voteInstructions = header.add( {
			xype: 'container',
			border: 0,
			layout: {
				type: 'vbox',
				align: 'stretch'
			},
			bodyStyle: {
				'background-color': myApp.DARK_BROWN
			},
			padding: '10 10 0 10'
		});
		
		var processInstructions = header.add( {
			xype: 'container',
			border: 0,
			layout: {
				type: 'hbox',
				align: 'stretch'
			},
			bodyStyle: {
				'background-color': myApp.DARK_BROWN
			},
			padding: '5 10 10 10'
		});
		
		voteInstructions.add( {
			xtype: 'label',
			html: 'It\'s time to review our backlog and vote to keep or sweep old items. You\'ll be presented with each item under consideration and asked whether we should keep it on the backlog or sweep it into the recycle bin. Your choices are tracked as comments on the artifact for later action.',
			style: {
				'font-size': myApp.FONT_SIZE,
				'color': '#FFFFFF'
			}
		} );
		
		processInstructions.add( {
			xtype: 'label',
			html: 'When we have all cast our votes, we will review the results to quickly clean our backlog:  ',
			style: {
				'font-size': myApp.FONT_SIZE,
				'color': '#FFFFFF'
			}
		} );
		
		myApp.addButton( processInstructions, 'Process Team Votes', myApp.YELLOW, function(){
			myApp.clearContent();
			myApp.checkItemVotes( 0, false );
		} );
		myApp.loadItems( 'Defect' );
	},
	
	loadItems:function( model ) {
		myApp._myMask.show();
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
						myApp.checkItemVotes( 0, true );
					}
				} else {
					myApp._myMask.hide();
					myApp.clearContent();
					myApp.addLabel( myApp, "Error loading work items of type " + model + ":" );
					myApp.addLabel( myApp, operation.error.errors[0] );
				}
			}
		});
	},
	
	checkItemVotes:function( itemIndex, voteMode ) {
		if( itemIndex <= myApp.itemBacklog.length - 1 ) {
			myApp._myMask.show();
			var workItem = myApp.itemBacklog[ itemIndex ];
			workItem.getCollection( 'Discussion' ).load( {
				fetch: [ 
					'User',
					'Text',
					'CreationDate'
				],
				sorters: [
					{
						property: 'CreationDate',
						direction: 'DESC'
					}
				],
				callback: function( records, operation ) {
					if( operation.wasSuccessful() ) {
						var voteData = [];
						
						var cutOffDate = new Date();
						if ( myApp.getSetting( 'revoteWindow' ) ) {
							cutOffDate.setDate( cutOffDate.getDate() - myApp.getSetting( 'revoteWindow' ) );
						}
						
						var foundMyVote = false;
						var myUserName = myApp.getContext().getUser()._refObjectName;
						_.each( records, function( record ) {
							var voteUserName = record.data.User._refObjectName;
							if( record.data.Text.includes( myApp.POWERED_BY_MESSAGE ) && ( record.data.CreationDate <= cutOffDate ) ) {
								var votePoint = [
									voteUserName,
									record.data.Text.includes( myApp.KEEP_MESSAGE ) ? myApp.KEEP_MESSAGE : myApp.SWEEP_MESSAGE,
									record.data.CreationDate
								];
								
								if( myUserName == voteUserName ) {
									foundMyVote = true;
								}
								
								// Only add the vote if there isn't a vote already for this user
								if( !_.contains( _.map( voteData, function( vote ) { return vote[ 0 ] } ), voteUserName ) ) {
									voteData.push( votePoint );
								}
							}
						}, myApp );
						workItem.votes = voteData;
						
						if( voteMode ) {
							if( !foundMyVote ) {
								myApp.presentItemForVote( itemIndex );
							} else {
								myApp.checkItemVotes( itemIndex + 1, true );
							}
						} else {
							myApp.presentItemForProcess( itemIndex );
						}
					} else {
						myApp._myMask.hide();
						myApp.clearContent();
						myApp.addLabel( myApp, "Error getting conversation posts for " + workItem.data.FormattedID + ":" );
						myApp.addLabel( myApp, operation.error.errors[0] );
					}
				}
			} );
		} else {
			// TODO: Add something more fun here. Maybe a pie chart?
			myApp._myMask.hide();
			if ( voteMode ) {
				myApp.addLabel( myApp, 'It\'s Over! Thanks for your votes.' );
			} else {
				myApp.addLabel( myApp, 'It\'s Over! Your backlog never looked so clean!' );
			}
		}
	},
	
	presentItemForVote:function( itemIndex ) {
		myApp._myMask.hide();
		var item = myApp.itemBacklog[ itemIndex ];
		myApp.addLabel( myApp, 'Approximately ' + ( myApp.itemBacklog.length - itemIndex - 1 ) + ' Items Remaining');
		
		var buttonBox = myApp.add( {
			xype: 'container',
			border: 0,
			layout: {
				type: 'hbox',
				align: 'stretch'
			},
			padding: '10 0 10 0'
		});
		
		myApp.addButton( buttonBox, myApp.KEEP_MESSAGE, myApp.GREEN, function(){ myApp.voteItem( itemIndex, true ); } );
		myApp.addButton( buttonBox, myApp.SWEEP_MESSAGE, myApp.RED, function(){ myApp.voteItem( itemIndex, false ); } );
		myApp.addButton( buttonBox, 'Skip', myApp.YELLOW, function(){
			myApp.clearContent();
			myApp.checkItemVotes( itemIndex + 1, true );
		} );
		myApp.displayItemDetails( item );
	},
	
	displayItemDetails:function( item ) {
		var descriptionBox = myApp.add( {
			xype: 'container',
			border: 0,
			layout: {
				type: 'vbox'
			}
		});
		myApp.addButton( descriptionBox, 'View Full Details', myApp.DARK_BROWN, function(){ Rally.nav.Manager.showDetail( item.raw._ref ); } );
		myApp.addHeader( descriptionBox, 'ID');
		myApp.addLabel( descriptionBox, item.data.FormattedID );
		myApp.addHeader( descriptionBox, 'Name' );
		myApp.addLabel( descriptionBox, item.data.Name );
		myApp.addHeader( descriptionBox, 'Creation Date' );
		myApp.addLabel( descriptionBox, item.data.CreationDate.toLocaleString( 'en-US' ) );
		myApp.addHeader( descriptionBox, 'Description' );
		myApp.addLabel( descriptionBox, item.data.Description );
	},
	
	voteItem:function( itemIndex, keep ) {
		var item = myApp.itemBacklog[ itemIndex ];
		myApp._myMask.show();
		
		var post = Ext.create( myApp.conversationPostModel, {
			Text: ( keep ? myApp.KEEP_MESSAGE : myApp.SWEEP_MESSAGE ) + '<br/>' + myApp.POWERED_BY_MESSAGE,
			Artifact: item.data._ref
		} );
		
		post.save( {
			callback: function( result, operation ){
				if ( operation.wasSuccessful() ) {
					myApp.clearContent();
					myApp.checkItemVotes( itemIndex + 1, true );
				} else {
					myApp._myMask.hide();
					myApp.clearContent();
					myApp.addLabel( myApp, "Error adding vote conversation post to " + item.data.FormattedID + ":" );
					myApp.addLabel( myApp, operation.error.errors[0] );
				}
			}
		});
	},
	
	presentItemForProcess:function( itemIndex ) {
		myApp._myMask.hide();
		myApp.clearContent();
		var item = myApp.itemBacklog[ itemIndex ];
		myApp.addLabel( myApp, ( myApp.itemBacklog.length - itemIndex - 1 ) + ' Items Remaining');
	
		var buttonBox = myApp.add( {
			xype: 'container',
			border: 0,
			layout: {
				type: 'hbox',
				align: 'stretch'
			},
			padding: '10 0 10 0'
		});
	
		myApp.addButton( buttonBox, myApp.KEEP_MESSAGE, myApp.GREEN, function(){ myApp.checkItemVotes( itemIndex + 1, false ); } );
		myApp.addButton( buttonBox, myApp.SWEEP_MESSAGE, myApp.RED, function(){ myApp.deleteItem( itemIndex ); } );
		
		//Display vote results
		var votesStore = Ext.create( 'Ext.data.ArrayStore', {
			storeId:'votesStore',
			fields:[
				{name: 'user', type: 'string' },
				{name: 'vote', type: 'string' },
				{name: 'creationDate', type: 'date' }
			],
			data: item.votes
		});

		myApp.add( {
			xtype: 'rallygrid',
			showPagingToolbar: false,
			showRowActionsColumn: false,
			editable: false,
			store: votesStore,
			columnCfgs: [
				{
					text: 'User',
					dataIndex: 'user',
					flex: true
				},
				{
					text: 'Vote',
					dataIndex: 'vote',
					flex: true
				},
				{
					text: 'Date',
					dataIndex: 'creationDate',
					flex: true
				}
			]
		} );
		
		myApp.displayItemDetails( item );
	},
	
	deleteItem:function( itemIndex ) {
		var item = myApp.itemBacklog[ itemIndex ];
		myApp._myMask.show();
		
		item.destroy( {
			callback: function( result, operation ){
				if ( operation.wasSuccessful() ) {
					myApp.clearContent();
					myApp.checkItemVotes( itemIndex + 1, false );
				} else {
					myApp._myMask.hide();
					myApp.clearContent();
					myApp.addLabel( myApp, "Error deleting " + item.data.FormattedID + ":" );
					myApp.addLabel( myApp, operation.error.errors[0] );
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
			'color': ( color === myApp.DARK_BROWN ) ? myApp.WHITE : myApp.DARK_BROWN,
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