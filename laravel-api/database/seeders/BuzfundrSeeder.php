<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class BuzfundrSeeder extends Seeder
{
    public function run(): void
    {
        // ═══════════ DEMO ISSUER ═══════════
        DB::table('issuers')->insertOrIgnore([
            [
                'id' => 1,
                'company_name' => 'TechVentures Inc.',
                'wallet_address' => '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
                'email' => 'founder@techventures.com',
                'total_raised_12m' => 0,
                'confirmed_no_other_platforms' => true,
                'acknowledged_lying_is_crime' => true,
                'offering_document_path' => null,
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'id' => 2,
                'company_name' => 'GreenEnergy Corp.',
                'wallet_address' => '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
                'email' => 'ceo@greenenergy.com',
                'total_raised_12m' => 0,
                'confirmed_no_other_platforms' => true,
                'acknowledged_lying_is_crime' => true,
                'offering_document_path' => null,
                'created_at' => now(),
                'updated_at' => now(),
            ],
        ]);

        // ═══════════ DEMO INVESTORS ═══════════
        DB::table('investors')->insertOrIgnore([
            [
                'id' => 1,
                'wallet_address' => '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
                'name' => 'Alice Investor',
                'email' => 'alice@investor.com',
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'id' => 2,
                'wallet_address' => '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
                'name' => 'Bob Investor',
                'email' => 'bob@investor.com',
                'created_at' => now(),
                'updated_at' => now(),
            ],
        ]);

        $this->command->info('✅ Buzfundr demo data seeded (2 issuers + 2 investors)');
    }
}
