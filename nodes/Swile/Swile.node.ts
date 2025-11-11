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
					const accessToken = credentials.bearerToken as string;

					// Récupérer le contexte statique (mémoire persistante)
					const staticData = this.getWorkflowStaticData('node');

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
