import type { BsReference } from '../brainstem/schema';

/** Sources of the vascular section, each checked against its open-access full text (Europe PMC). */
const doi = (d: string) => `https://doi.org/${d}`;
export const VA_REFERENCES: BsReference[] = [
  { id: 'zheng2019', pmid: '30514102', pmcid: 'PMC6686434', shortLabel: 'Zheng 2019', url: doi('10.1177/0963689718817227'),
    citation: 'Zheng Y, Zhou B, Wang X, Chen H, Fang X, Jiang P, et al. Size, aspect ratio and anatomic location of ruptured intracranial aneurysms: consecutive series of 415 patients from a prospective, multicenter, observational study. Cell Transplant. 2019;28(6):739–746. doi:10.1177/0963689718817227.' },
  { id: 'xu2022', pmid: '35720088', pmcid: 'PMC9202754', shortLabel: 'Xu 2022', url: doi('10.3389/fneur.2022.925115'),
    citation: 'Xu C, Wu P, Zou L, Xu S, Luo B, Yang X, et al. Anterior circulation fusiform aneurysms have a lower occlusion rate after Pipeline embolization device treatment than posterior circulation fusiform aneurysms: a multicenter cohort study. Front Neurol. 2022;13:925115. doi:10.3389/fneur.2022.925115.' },
  { id: 'wroe2025', pmid: '41313592', pmcid: 'PMC12662770', shortLabel: 'Wroe 2025', url: doi('10.1177/15910199251398360'),
    citation: 'Wroe WW, Zeineddine HA, Yu SY, Freeman BH, Cook RS, Christensen CM, et al. Outcomes after flow diversion for ruptured blood blister-like and dissecting aneurysms: a single-center series. Interv Neuroradiol. 2025. doi:10.1177/15910199251398360.' },
  { id: 'naranbhai2023', pmid: '36824547', pmcid: 'PMC9942537', shortLabel: 'Naranbhai 2023', url: doi('10.7759/cureus.34053'),
    citation: 'Naranbhai N, Pérez R. Management of brain arteriovenous malformations: a review. Cureus. 2023;15(1):e34053. doi:10.7759/cureus.34053.' },
  { id: 'hofman2018', pmid: '30627242', pmcid: 'PMC6323595', shortLabel: 'Hofman 2018', url: doi('10.5114/pjr.2018.76750'),
    citation: 'Hofman M, Jamróz T, Kołodziej I, Jaskólski J, Ignatowicz A, Jakutowicz I, et al. Cerebral arteriovenous malformations – usability of Spetzler-Martin and Spetzler-Ponce scales in qualification to endovascular embolisation and neurosurgical procedure. Pol J Radiol. 2018;83:e243–e247. doi:10.5114/pjr.2018.76750.' },
  { id: 'assker2025', pmid: '40469353', pmcid: 'PMC12134889', shortLabel: 'Assker 2025', url: doi('10.25259/SNI_140_2025'),
    citation: 'Assker MM, Youssef AM, Mohammed SAS, Akar NM, Hashim MA, Kadhim N, et al. Cerebral arteriovenous malformations classification systems in comparison with Spetzler-Martin: a comparative review. Surg Neurol Int. 2025;16:173. doi:10.25259/SNI_140_2025.' },
  { id: 'jain2019', pmid: '31607956', pmcid: 'PMC6769414', shortLabel: 'Jain 2019', url: doi('10.3389/fphys.2019.01250'),
    citation: 'Jain MS, Do HM, Massoud TF. Computational network modeling of intranidal hemodynamic compartmentalization in a theoretical three-dimensional brain arteriovenous malformation. Front Physiol. 2019;10:1250. doi:10.3389/fphys.2019.01250.' },
  { id: 'wu2024', pmid: '39698707', pmcid: 'PMC11651979', shortLabel: 'Wu 2024', url: doi('10.21037/qims-24-1097'),
    citation: 'Wu C, Dong M, Zang Z, Shan Y, Yu J, Hong T, et al. Comparison of silent MRA and time-of-flight MRA in the depiction and grading of brain arteriovenous malformations. Quant Imaging Med Surg. 2024;14(12):8974–8987. doi:10.21037/qims-24-1097.' },
  { id: 'hafez2019', pmid: '29733392', pmcid: 'PMC6331307', shortLabel: 'Hafez 2019', url: doi('10.1093/neuros/nyy153'),
    citation: 'Hafez A, Koroknay-Pál P, Oulasvirta E, Elseoud AA, Lawton MT, Niemelä M, et al. The application of the novel grading scale (Lawton-Young grading system) to predict the outcome of brain arteriovenous malformation. Neurosurgery. 2019;84(2):529–536. doi:10.1093/neuros/nyy153.' },
  { id: 'baharvahdat2020', pmid: '32411408', pmcid: 'PMC7213517', shortLabel: 'Baharvahdat 2020', url: doi('10.1136/svn-2019-000269'),
    citation: 'Baharvahdat H, Ooi YC, Kim WJ, Mowla A, Coon AL, Colby GP. Updates in the management of cranial dural arteriovenous fistula. Stroke Vasc Neurol. 2020;5(1):50–58. doi:10.1136/svn-2019-000269.' },
  { id: 'li2015', pmid: '26120845', pmcid: 'PMC4488263', shortLabel: 'Li 2015', url: doi('10.1371/journal.pone.0131235'),
    citation: 'Li C, Wang Y, Li Y, Jiang C, Yang X, Wu Z. Clinical and angioarchitectural risk factors associated with intracranial hemorrhage in dural arteriovenous fistulas: a single-center retrospective study. PLoS One. 2015;10(6):e0131235. doi:10.1371/journal.pone.0131235.' },
  { id: 'shakeel2025', pmid: '41584558', pmcid: 'PMC12825111', shortLabel: 'Shakeel 2025', url: doi('10.5114/pjr/210253'),
    citation: 'Shakeel M, Rehman A, Haq TU, Syed HS. Endovascular embolization of dural arteriovenous fistulas: an 8-year single-centre experience and comparison with contemporary literature. Pol J Radiol. 2025;90:e591–e601. doi:10.5114/pjr/210253.' },
  { id: 'mishra2022', pmid: '36480822', pmcid: 'PMC9829563', shortLabel: 'Mishra 2022', url: doi('10.7461/jcen.2022.E2022.05.004'),
    citation: 'Mishra K, Kumar V, Vinay, Gandhi A, Srivastava T. Carotid cavernous fistula: redefining the angioarchitecture. J Cerebrovasc Endovasc Neurosurg. 2022;24(4):356–365. doi:10.7461/jcen.2022.E2022.05.004.' },
];
