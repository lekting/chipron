export default interface ParsedObject {
    id?: number;
    type?: number;
    url?: string;
    name?: string;
    poster?: string;
    year?: string;
    country?: string[];
    duration?: string;
    director?: string;
    genres?: string[];
    actors?: string[];
    rating?: string;
    description?: string;
    trailer?: string;
    season?: string;
    dubber?: string;
    movieLink?: string[];
    count_of_series?: number;
    tempVideoName?: string;
}
