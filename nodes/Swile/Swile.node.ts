import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
} from 'n8n-workflow';

export class Swile implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Swile',
		name: 'swile',
		icon: 'file:swile.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Interact with Swile API',
		defaults: {
			name: 'Swile',
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
					{
						name: 'Refresh Bearer Token',
						value: 'refreshBearer',
						description: 'Manually refresh the bearer token',
						action: 'Refresh bearer token',
					},
				],
				default: 'getBalance',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const operation = this.getNodeParameter('operation', 0) as string;

		for (let i = 0; i < items.length; i++) {
			try {
				if (operation === 'getBalance') {
					// Récupérer les credentials
					const credentials = await this.getCredentials('swileApi');
					const apiKey = credentials.apiKey as string;
					const clientId = credentials.clientId as string;
					const bearerToken = credentials.bearerToken as string;
					let refreshToken = credentials.refreshToken as string;

					// Récupérer le contexte statique (mémoire persistante)
					const staticData = this.getWorkflowStaticData('node');

					// Utiliser l'access token stocké s'il existe, sinon le bearer token des credentials
					let accessToken = staticData.lastAccessToken as string || bearerToken;

					// Fonction pour rafraîchir le token
					const refreshAccessToken = async () => {
						// Utiliser le refresh token stocké s'il existe
						if (staticData.lastRefreshToken) {
							const tokenData = staticData.lastRefreshToken as any;
							refreshToken = tokenData.refresh_token;
						}

						const refreshResponse = await this.helpers.request({
							method: 'POST',
							url: 'https://directory.swile.co/oauth/token',
							headers: {
								'Content-Type': 'application/json',
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
							body: JSON.stringify({
								client_id: clientId,
								grant_type: 'refresh_token',
								refresh_token: refreshToken,
							}),
							json: false,
						});

						const parsedResponse = JSON.parse(refreshResponse as string);
						staticData.lastRefreshToken = parsedResponse;
						staticData.lastAccessToken = parsedResponse.access_token;
						return parsedResponse.access_token;
					};

					// Fonction pour récupérer les wallets
					const getWallets = async (token: string) => {
						return await this.helpers.request({
							method: 'GET',
							url: 'https://neobank-api.swile.co/api/v0/wallets',
							headers: {
								'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/112.0',
								'Accept': '*/*',
								'Accept-Language': 'fr',
								'Referer': 'https://team.swile.co/',
								'X-Lunchr-Platform': 'web',
								'Authorization': `Bearer ${token}`,
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
					};

					let walletsResponse: any;

					try {
						// Essayer d'abord avec le token actuel
						walletsResponse = await getWallets(accessToken);
					} catch (error: any) {
						// Si erreur 401, rafraîchir le token et réessayer
						if (error.statusCode === 401 || error.response?.statusCode === 401) {
							accessToken = await refreshAccessToken();
							walletsResponse = await getWallets(accessToken);
						} else {
							throw error;
						}
					}

					const payload = walletsResponse as any;
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
						}
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
