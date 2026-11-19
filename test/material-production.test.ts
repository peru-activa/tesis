import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { workshopSchema, recommendationRequestSchema } from '../src/domain/contracts.js';
import { productionForMaterial } from '../src/domain/material-production.js';
import { recommendWorkshops, allocationCapacityProblems } from '../src/domain/recommend.js';
import { compareRecommendationAlgorithms } from '../src/domain/compare-recommendations.js';
import { capacityWorkshop } from './fixtures/capacity.js';
import { productionOrderForGarment } from '../src/application/quotation-order-adapter.js';

function workshop() { return capacityWorkshop({ materials: ['Algodón', 'Umbrela'], materialMatchingMode: 'declared_only',
  workingDays: undefined, processes: ['design','cutting','sewing','printing','finishing'],
  productionRate: { quantity: 10000, days: 6 }, baseProductionMaterials: ['Algodón'],
  productionByMaterial: [{ materials: ['Umbrela'], capacityStatus: 'known', productionRate: { quantity: 2000, days: 6 } }],
}); }
function request(material: string) { return recommendationRequestSchema.parse({ evaluatedAt:'2099-11-02T10:00:00-05:00',
  order:{ id:'rate-by-material', product:'polo', quantity:5000, material, fabricBuyer:'peru_activa',
    requiredProcesses:['design','cutting','sewing','printing','finishing'], requiredBy:'2099-11-06T18:00:00-05:00' },
  workshops:[workshop()], }); }

describe('production rates scoped by material',()=>{
 it('retains base rates for existing material and applies the declared rate to another material',()=>{
  assert.deepEqual(productionForMaterial(workshop(),'algodón').productionRate,{quantity:10000,days:6});
  assert.deepEqual(productionForMaterial(workshop(),' UMBRELA ').productionRate,{quantity:2000,days:6});
  assert.ok(recommendWorkshops(request('Algodón')).candidates.length);
  assert.equal(recommendWorkshops(request('Umbrela')).candidates.length,0);
 });
 it('never borrows a base rate when capacity for a different material is unknown',()=>{
  const profile=workshop();profile.productionByMaterial=[{materials:['Umbrela'],capacityStatus:'unknown'}];
  assert.equal(productionForMaterial(profile,'Umbrela').productionRate,undefined);
  assert.equal(productionForMaterial(profile,'Umbrela').capacityStatus,'unknown');
  assert.equal(recommendWorkshops({...request('Umbrela'),workshops:[profile]}).candidates.length,0);
  assert.equal(productionForMaterial(profile,'Otra tela').capacityStatus,'unknown');
 });
 it('shares the same constraints between the baseline, genetic algorithm and reservation check',()=>{
  const input=request('Umbrela');const comparison=compareRecommendationAlgorithms(input,42);
  assert.equal(comparison.summary.baselineFeasible,false);assert.equal(comparison.summary.geneticFeasible,false);
  assert.ok(allocationCapacityProblems(input,[{workshopId:'resource',quantity:5000}]).length);
  const later={...input,order:{...input.order,requiredBy:'2099-12-20T18:00:00-05:00'}};
  assert.ok(recommendWorkshops(later).candidates.length);
  assert.equal(allocationCapacityProblems(later,[{workshopId:'resource',quantity:5000}]).length,0);
 });
 it('converts committed work with the rate of its own material',()=>{
  const input=request('Umbrela');
  const base={...input,order:{...input.order,quantity:2000,requiredBy:'2099-11-12T18:00:00-05:00'}};
  const queued={orderId:'other',workshopId:'resource',quantity:10000,assignedProcesses:base.order.requiredProcesses,embroideryApplicationsPerGarment:1};
  const cotton=recommendWorkshops({...base,committedWork:[{...queued,material:'Algodón'}]});
  const umbrella=recommendWorkshops({...base,committedWork:[{...queued,material:'Umbrela'}]});
  assert.equal(cotton.candidates.length,0);
  const longer={...base,order:{...base.order,requiredBy:'2099-11-16T18:00:00-05:00'}};
  assert.ok(recommendWorkshops({...longer,committedWork:[{...queued,material:'Algodón'}]}).candidates.length);
  assert.equal(recommendWorkshops({...longer,committedWork:[{...queued,material:'Umbrela'}]}).candidates.length,0);
 });
 it('does not treat a rate profile as permission to handle an unsupported fabric',()=>{
  const profile={...workshop(),materials:['Algodón']};
  assert.equal(recommendWorkshops({...request('Umbrela'),workshops:[profile]}).candidates.length,0);
 });
 it('preserves legacy profiles without a material scope and validates the new contract',()=>{
  const profile=capacityWorkshop();assert.equal(productionForMaterial(profile,'Algodón'),profile);
  assert.equal(workshopSchema.safeParse({...profile,productionByMaterial:[{materials:['Umbrela'],capacityStatus:'known'}]}).success,false);
 });
 it('uses the existing family classification for any material rather than a list of particular names',()=>{
  const order=productionOrderForGarment({id:'material-profile',garment:{product:'polo',model:'Cuello redondo',
   fabric:{mode:'specified',name:'Umbrela'},quantity:5000,customization:'printing',applicationCount:1},
   selectedFabric:'Umbrela',fabricBuyer:'peru_activa',requiredBy:'2099-12-20T18:00:00-05:00'});
  assert.equal(order.poloType,'sports');assert.equal(order.fabricSupply.category,'base');
 });
});
