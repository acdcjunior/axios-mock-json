import * as fs from "fs";
import MockAdapter from 'axios-mock-adapter';
import {AxiosInstance} from "axios";
import {Stub} from "../Stub";

export interface StubsRecorderOptions {
    includeHeaders?: boolean;
    stubTransformer?: (s: Stub) => Stub
}
const DEFAULT_OPTIONS: StubsRecorderOptions = {
    includeHeaders: false,
    stubTransformer: s => s
};

let currentMockAdapter;
export default function axiosStubsRecorder(axios: AxiosInstance, stubsFileName: string, options: StubsRecorderOptions): MockAdapter {
    if (currentMockAdapter) {
        currentMockAdapter.restore();
    }
    // @ts-ignore
    const unmockedAxios = axios.create();
    currentMockAdapter = new MockAdapter(axios);

    mockRequests(stubsFileName, unmockedAxios, currentMockAdapter, { ...DEFAULT_OPTIONS, ...options });

    return currentMockAdapter;
};

function stringToStubsArray(text: string) {
    if (text === '') {
        return [];
    }
    let stubs = JSON.parse(text);
    if (!stubs) {
        return [];
    }
    if (!Array.isArray(stubs)) {
        return [stubs];
    }
    return stubs;
}

function loadStubsFromFile(path) {
    if (!fs.existsSync(path)) {
        return stringToStubsArray('');
    }
    return stringToStubsArray(fs.readFileSync(path, 'utf8'));
}

const BODY_METHODS = ['POST', 'PUT'];

function extractData(config) {
    if (BODY_METHODS.includes(config.method.toUpperCase()) && (config.headers['Content-Type'] || '').includes('application/json')) {
        return JSON.parse(config.data);
    }
    return config.data;
}

function mockRequests(stubsFileName, unmockedAxios: AxiosInstance, axiosMockAdapter, options: StubsRecorderOptions) {

    axiosMockAdapter.onAny().reply((async config => {
        const response = await unmockedAxios.request(config);

        const stubs = loadStubsFromFile(stubsFileName);

        let stubPreviouslySaved = stubs.find(stub => config.url === stub.request.url && config.method.toUpperCase() === stub.request.method.toUpperCase());

        if (!stubPreviouslySaved) {
            stubPreviouslySaved = { };
            stubs.push(stubPreviouslySaved);
        }

        Object.assign(stubPreviouslySaved, {
            request: {
                method: config.method.toUpperCase(),
                url: config.url,
                headers: options.includeHeaders ? config.headers : undefined,
                body: extractData(config)
            },
            response: {
                status: response.status,
                headers: options.includeHeaders ? response.headers : undefined,
                body: response.data,
            }
        });

        const transformedStubs: Stub[] = stubs.map(options.stubTransformer);
        transformedStubs.sort((a, b) => (a.request.url + a.request.method.toUpperCase()).localeCompare(b.request.url + b.request.method.toUpperCase()));

        fs.writeFileSync(stubsFileName, JSON.stringify(transformedStubs, null, '  '));

        return [response.status, response.data, response.headers];
    }) as any);
}
