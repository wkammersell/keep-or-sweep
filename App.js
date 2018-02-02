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
	THEME_COLOR_1: '#4E1E1E',
	THEME_COLOR_2: '#58E481',
	THEME_COLOR_3: '#E63870',
	THEME_COLOR_4: '#FBE6A2',
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
				'background-color': myApp.THEME_COLOR_1
			}
		});
		
		header.add( {
			xtype: 'label',
			html: 'It\'s time to review our backlog and vote to keep or sweep. You\'ll be presented with each item under consideration and asked whether we should keep it on the backlog or sweep it into the recycle bin. Your choices are tracked as comments on the artifact for later action.<br/>',
			style: {
				'font-size': '15px',
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
			myApp.add( {
				xtype: 'label',
				html: 'Item ' + ( itemIndex + 1 ) + ' of ' + myApp.itemBacklog.length + '</br></br>',
				style: {
					'font-size': '15px'
				}
			} );
		
			myApp.add( {
				xtype: 'rallybutton',
				itemId: 'keepButton',
				text: 'Keep',
				handler: function(){ myApp.processItem( itemIndex, true ); },
				style: {
					'background-color': myApp.THEME_COLOR_2,
					'border-color': myApp.THEME_COLOR_2
				}
			} );
		
			myApp.add( {
				xtype: 'rallybutton',
				itemId: 'sweepButton',
				text: 'Sweep',
				handler: function(){ myApp.processItem( itemIndex, false ); },
				style: {
					'background-color': myApp.THEME_COLOR_3,
					'border-color': myApp.THEME_COLOR_3
				}
			} );
		
			myApp.add( {
				xtype: 'rallybutton',
				itemId: 'skipButton',
				text: 'Skip',
				handler: function(){
					myApp.clearContent();
					myApp.presentItem( itemIndex + 1 );
				},
				style: {
					'background-color': myApp.THEME_COLOR_4,
					'border-color': myApp.THEME_COLOR_4,
					'font-color': myApp.THEME_COLOR_3
				}
			} );
		
			myApp.add( {
				xtype: 'label',
				html: '<br/><br/><u><b>ID</b></u><br/>',
				style: {
					'font-size': '15px',
					'color': myApp.THEME_COLOR_1
				}
			} );
		
			myApp.add( {
				xtype: 'label',
				html: item.FormattedID,
				style: {
					'font-size': '15px'
				}
			} );
		
			myApp.add( {
				xtype: 'label',
				html: '<br/><br/><u><b>Name</b></u><br/>',
				style: {
					'font-size': '15px',
					'color': myApp.THEME_COLOR_1
				}
			} );
		
			myApp.add( {
				xtype: 'label',
				html: item.Name,
				style: {
					'font-size': '15px'
				}
			} );
		
			myApp.add( {
				xtype: 'label',
				html: '<br/><br/><u><b>Creation Date</b></u><br/>',
				style: {
					'font-size': '15px',
					'color': myApp.THEME_COLOR_1
				}
			} );
		
			myApp.add( {
				xtype: 'label',
				html: item.CreationDate.toLocaleString( 'en-US' ),
				style: {
					'font-size': '15px'
				}
			} );
		
			myApp.add( {
				xtype: 'label',
				html: '<br/><br/><u><b>Description</b></u><br/>',
				style: {
					'font-size': '15px',
					'color': myApp.THEME_COLOR_1
				}
			} );
		
			myApp.add( {
				xtype: 'label',
				html: item.Description,
				style: {
					'font-size': '15px'
				}
			} );
		} else {
			myApp.add( {
				xtype: 'label',
				html: 'It\'s Over! Thanks for your votes.',
				style: {
					'font-size': '15px',
					'color': myApp.THEME_COLOR_1
				}
			} );
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