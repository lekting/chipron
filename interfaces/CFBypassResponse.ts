export default interface CFBypassResponse {
    status: string;
    startTimestamp: number;
    endTimestamp: number;
    solution: {
        url: string;
        response: string;
        cookies: any;
    };
}
