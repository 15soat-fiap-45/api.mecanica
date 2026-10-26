export interface VehicleContact {
    name: string;
    email: string;
}

export interface VehicleContactLookup {
    findByVehicleId(vehicleId: string): Promise<VehicleContact | null>;
}
