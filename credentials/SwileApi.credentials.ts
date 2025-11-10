import {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class SwileApi implements ICredentialType {
	name = 'swileApi';
	displayName = 'Swile API';
	documentationUrl = 'https://swile.co';
	properties: INodeProperties[] = [
		{
			displayName: 'Bearer Token',
			name: 'bearerToken',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description: 'Initial bearer token for authentication',
		},
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description: 'API key for Swile',
		},
		{
			displayName: 'Client ID',
			name: 'clientId',
			type: 'string',
			default: '',
			required: true,
			description: 'OAuth client ID',
		},
		{
			displayName: 'Refresh Token',
			name: 'refreshToken',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description: 'Initial refresh token (will be updated automatically)',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				'X-Api-Key': '={{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://neobank-api.swile.co',
			url: '/api/v0/wallets',
			method: 'GET',
			headers: {
				'Authorization': '=Bearer {{$credentials.bearerToken}}',
				'X-Api-Key': '={{$credentials.apiKey}}',
			},
		},
	};
}
