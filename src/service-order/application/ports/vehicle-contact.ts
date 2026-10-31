export interface VehicleContact {
    name: string;
    email: string;
    /** CPF/CNPJ do titular do veículo, apenas dígitos. */
    customerDocument: string;
}

export interface VehicleContactLookup {
    findByVehicleId(vehicleId: string): Promise<VehicleContact | null>;
}
