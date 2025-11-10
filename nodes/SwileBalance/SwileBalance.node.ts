import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
} from 'n8n-workflow';

export class SwileBalance implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Swile Balance',
		name: 'swileBalance',
		icon: 'file:swile.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Check Swile balance and refresh tokens',
		defaults: {
			name: 'Swile Balance',
		},
		inputs: ['main'],
		outputs: ['main'],
		credentials: [
			{
				name: 'swileApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Get Balance',
						value: 'getBalance',
						description: 'Get wallet balance from Swile',
						action: 'Get balance from Swile',
					},
				],
				default: 'getBalance',
			},
			{
				displayName: 'Changes Only',
				name: 'changesOnly',
				type: 'boolean',
				default: true,
				description: 'Whether to emit events only when balance changes',
			},
			{
				displayName: 'Debug',
				name: 'debug',
				type: 'boolean',
				default: false,
				description: 'Whether to enable debug logging',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const operation = this.getNodeParameter('operation', 0) as string;
		const changesOnly = this.getNodeParameter('changesOnly', 0) as boolean;
		const debug = this.getNodeParameter('debug', 0) as boolean;

		for (let i = 0; i < items.length; i++) {
			try {
				if (operation === 'getBalance') {
					// Récupérer les credentials
					const credentials = await this.getCredentials('swileApi');
					const apiKey = credentials.apiKey as string;
					const clientId = credentials.clientId as string;
					let bearerToken = credentials.bearerToken as string;
					let refreshToken = credentials.refreshToken as string;

					// Récupérer le contexte statique (mémoire persistante)
					const staticData = this.getWorkflowStaticData('node');

					// Rafraîchir le token
					let accessToken: string;

					if (staticData.lastRefreshToken) {
						// Utiliser le refresh token stocké
						const tokenData = staticData.lastRefreshToken as any;
						refreshToken = tokenData.refresh_token;

						if (debug) {
							console.log('Using stored refresh token');
						}
					}

					// Appel API pour rafraîchir le token
					const refreshResponse = await this.helpers.request({
						method: 'POST',
						url: 'https://directory.swile.co/oauth/token',
						headers: {
							'Authority': 'directory.swile.co',
							'X-Lunchr-App-Version': '0.1.0',
							'Authorization': `Bearer ${bearerToken}`,
							'Accept-Language': 'fr',
							'X-Lunchr-Platform': 'web',
							'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.93 Safari/537.36',
							'X-Api-Key': apiKey,
							'Accept': '*/*',
							'Sec-Gpc': '1',
							'Origin': 'https://team.swile.co',
							'Sec-Fetch-Site': 'same-site',
							'Sec-Fetch-Mode': 'cors',
							'Sec-Fetch-Dest': 'empty',
							'Referer': 'https://team.swile.co/',
						},
						body: {
							client_id: clientId,
							grant_type: 'refresh_token',
							refresh_token: refreshToken,
						},
						json: true,
					});

					if (debug) {
						console.log('Token refresh response:', refreshResponse);
					}

					// Stocker le nouveau refresh token
					staticData.lastRefreshToken = refreshResponse;
					accessToken = refreshResponse.access_token;

					// Récupérer les wallets
					const walletsResponse = await this.helpers.request({
						method: 'GET',
						url: 'https://neobank-api.swile.co/api/v0/wallets',
						headers: {
							'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/112.0',
							'Accept': '*/*',
							'Accept-Language': 'fr',
							'Referer': 'https://team.swile.co/',
							'X-Lunchr-Platform': 'web',
							'Authorization': `Bearer ${accessToken}`,
							'X-Api-Key': apiKey,
							'Origin': 'https://team.swile.co',
							'Connection': 'keep-alive',
							'Sec-Fetch-Dest': 'empty',
							'Sec-Fetch-Mode': 'cors',
							'Sec-Fetch-Site': 'same-site',
							'Dnt': '1',
							'Pragma': 'no-cache',
							'Cache-Control': 'no-cache',
							'Te': 'trailers',
						},
						json: true,
					});

					if (debug) {
						console.log('Wallets response:', walletsResponse);
					}

					const payload = walletsResponse as any;

					if (changesOnly) {
						const lastStatus = staticData.lastStatus as any;

						if (!lastStatus) {
							// Première exécution : émettre tous les wallets
							if (payload.wallets && Array.isArray(payload.wallets)) {
								for (const wallet of payload.wallets) {
									returnData.push({
										json: wallet,
										pairedItem: i,
									});
								}
							}
							staticData.lastStatus = payload;
						} else {
							// Vérifier les changements
							const payloadStr = JSON.stringify(payload);
							const lastStatusStr = JSON.stringify(lastStatus);

							if (payloadStr !== lastStatusStr) {
								if (payload.wallets && Array.isArray(payload.wallets)) {
									for (const wallet of payload.wallets) {
										let found = false;

										if (lastStatus.wallets && Array.isArray(lastStatus.wallets)) {
											for (const walletBis of lastStatus.wallets) {
												if (
													wallet.id === walletBis.id &&
													JSON.stringify(wallet.balance) === JSON.stringify(walletBis.balance)
												) {
													found = true;
													break;
												}
											}
										}

										if (!found) {
											returnData.push({
												json: wallet,
												pairedItem: i,
											});
										}
									}
								}
								staticData.lastStatus = payload;
							} else {
								if (debug) {
									console.log('No changes detected');
								}
							}
						}
					} else {
						// Toujours émettre les données
						if (payload.wallets && Array.isArray(payload.wallets)) {
							for (const wallet of payload.wallets) {
								returnData.push({
									json: wallet,
									pairedItem: i,
								});
							}
						}
						staticData.lastStatus = payload;
					}
				}
			} catch (error) {
				if (this.continueOnFail()) {
					const errorMessage = error instanceof Error ? error.message : String(error);
					returnData.push({
						json: {
							error: errorMessage,
						},
						pairedItem: i,
					});
					continue;
				}
				throw new NodeOperationError(this.getNode(), error as Error, {
					itemIndex: i,
				});
			}
		}

		return [returnData];
	}
}
