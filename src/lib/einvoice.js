// Facture électronique au format UBL 2.1 (norme européenne EN 16931).
import { documentAmounts } from './documents'
import { contactName, round2 } from './utils'

const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const amount = (n) => Math.abs(round2(n)).toFixed(2)
const COUNTRY = { France: 'FR', Belgique: 'BE', Luxembourg: 'LU', Suisse: 'CH', Canada: 'CA', Monaco: 'MC' }

/** Catégorie de TVA EN 16931 : S (taux normal), AE (autoliquidation), G (export), Z (taux zéro). */
function taxCategory(rate, mention = '') {
  if (Number(rate) > 0) return 'S'
  if (/autoliquidation/i.test(mention)) return 'AE'
  if (/262|export/i.test(mention)) return 'G'
  return 'Z'
}

function party(tag, { name, street, city, zip, country, vat, legalId }) {
  return `  <cac:${tag}>
    <cac:Party>
      <cac:PartyName><cbc:Name>${esc(name)}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${esc(street)}</cbc:StreetName>
        <cbc:CityName>${esc(city)}</cbc:CityName>
        <cbc:PostalZone>${esc(zip)}</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>${COUNTRY[country] || 'FR'}</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>${vat ? `
      <cac:PartyTaxScheme><cbc:CompanyID>${esc(vat)}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>` : ''}
      <cac:PartyLegalEntity><cbc:RegistrationName>${esc(name)}</cbc:RegistrationName>${legalId ? `<cbc:CompanyID>${esc(legalId)}</cbc:CompanyID>` : ''}</cac:PartyLegalEntity>
    </cac:Party>
  </cac:${tag}>`
}

/** XML UBL d'une facture ou d'une note de crédit. */
export function buildUbl(doc, idx, paid = 0) {
  const s = idx.settings
  const credit = doc.type === 'avoir'
  const root = credit ? 'CreditNote' : 'Invoice'
  const cur = s.currency || 'EUR'
  const am = documentAmounts(doc)
  const rate = Number(doc.totals?.vatRate) || 0
  const regime = (s.vatRegimes || []).find((r) => r.id === s.vatRegimeId && Number(r.rate) === rate) || (s.vatRegimes || []).find((r) => Number(r.rate) === rate)
  const cat = taxCategory(rate, regime?.mention)
  const lines = (doc.sections || []).flatMap((sec) => sec.lines.map((l) => ({ ...l, section: sec.title })))
  const lineSum = lines.reduce((n, l) => n + Math.abs(Number(l.total) || 0), 0) + (doc.extraLines || []).reduce((n, l) => n + Math.abs(Number(l.amount) || 0), 0)
  // Remises, assurance, facture partielle : écart global entre les lignes et le total HT
  const diff = round2(Math.abs(am.exVat) - lineSum)
  const project = idx.project[doc.projectId]
  const client = idx.contact[doc.clientId]
  const einv = s.einvoice || {}
  const taxCategoryXml = `<cbc:ID>${cat}</cbc:ID><cbc:Percent>${rate}</cbc:Percent>${cat === 'AE' || cat === 'G' ? `<cbc:TaxExemptionReason>${esc(regime?.mention)}</cbc:TaxExemptionReason>` : ''}<cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>`
  const lineTag = credit ? 'CreditNoteLine' : 'InvoiceLine'
  const qtyTag = credit ? 'CreditedQuantity' : 'InvoicedQuantity'
  const allLines = [
    ...lines.map((l) => ({ name: l.label, qty: Number(l.qty) || 1, total: Math.abs(Number(l.total) || 0), note: l.section })),
    ...(doc.extraLines || []).map((l) => ({ name: l.label, qty: 1, total: Math.abs(Number(l.amount) || 0) })),
  ]
  const xmlLines = allLines
    .map(
      (l, i) => `  <cac:${lineTag}>
    <cbc:ID>${i + 1}</cbc:ID>${l.note ? `
    <cbc:Note>${esc(l.note)}</cbc:Note>` : ''}
    <cbc:${qtyTag} unitCode="C62">${round2(l.qty)}</cbc:${qtyTag}>
    <cbc:LineExtensionAmount currencyID="${cur}">${amount(l.total)}</cbc:LineExtensionAmount>
    <cac:Item><cbc:Name>${esc(l.name)}</cbc:Name><cac:ClassifiedTaxCategory>${taxCategoryXml}</cac:ClassifiedTaxCategory></cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="${cur}">${(l.qty ? l.total / l.qty : l.total).toFixed(4)}</cbc:PriceAmount></cac:Price>
  </cac:${lineTag}>`,
    )
    .join('\n')
  const allowance = diff < 0 ? -diff : 0
  const charge = diff > 0 ? diff : 0
  return `<?xml version="1.0" encoding="UTF-8"?>
<${root} xmlns="urn:oasis:names:specification:ubl:schema:xsd:${root}-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017</cbc:CustomizationID>
  <cbc:ID>${esc(doc.number)}</cbc:ID>
  <cbc:IssueDate>${esc(doc.date)}</cbc:IssueDate>${!credit && doc.dueDate ? `
  <cbc:DueDate>${esc(doc.dueDate)}</cbc:DueDate>` : ''}
  <cbc:${credit ? 'CreditNoteTypeCode' : 'InvoiceTypeCode'}>${credit ? 381 : 380}</cbc:${credit ? 'CreditNoteTypeCode' : 'InvoiceTypeCode'}>${einv.platform ? `
  <cbc:Note>Plateforme de dématérialisation : ${esc(einv.platform)}</cbc:Note>` : ''}
  <cbc:DocumentCurrencyCode>${cur}</cbc:DocumentCurrencyCode>${einv.buyerReference && project?.externalRef ? `
  <cbc:BuyerReference>${esc(project.externalRef)}</cbc:BuyerReference>` : ''}
${party('AccountingSupplierParty', { name: s.companyName, street: s.address, city: s.city, zip: s.zip, country: s.country, vat: s.vatNumber, legalId: s.siret })}
${party('AccountingCustomerParty', { name: contactName(client), street: client?.address, city: client?.city, zip: client?.zip, country: client?.country, vat: client?.vatNumber })}
  <cac:PaymentMeans>
    <cbc:PaymentMeansCode>30</cbc:PaymentMeansCode>
    <cac:PayeeFinancialAccount><cbc:ID>${esc((s.iban || '').replace(/\s+/g, ''))}</cbc:ID><cbc:Name>${esc(s.accountHolder || s.companyName)}</cbc:Name></cac:PayeeFinancialAccount>
  </cac:PaymentMeans>${allowance ? `
  <cac:AllowanceCharge><cbc:ChargeIndicator>false</cbc:ChargeIndicator><cbc:AllowanceChargeReason>Remises et ajustements</cbc:AllowanceChargeReason><cbc:Amount currencyID="${cur}">${amount(allowance)}</cbc:Amount><cac:TaxCategory>${taxCategoryXml}</cac:TaxCategory></cac:AllowanceCharge>` : ''}${charge ? `
  <cac:AllowanceCharge><cbc:ChargeIndicator>true</cbc:ChargeIndicator><cbc:AllowanceChargeReason>Assurance et frais</cbc:AllowanceChargeReason><cbc:Amount currencyID="${cur}">${amount(charge)}</cbc:Amount><cac:TaxCategory>${taxCategoryXml}</cac:TaxCategory></cac:AllowanceCharge>` : ''}
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${cur}">${amount(am.vat)}</cbc:TaxAmount>
    <cac:TaxSubtotal><cbc:TaxableAmount currencyID="${cur}">${amount(am.exVat)}</cbc:TaxableAmount><cbc:TaxAmount currencyID="${cur}">${amount(am.vat)}</cbc:TaxAmount><cac:TaxCategory>${taxCategoryXml}</cac:TaxCategory></cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${cur}">${amount(lineSum)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="${cur}">${amount(am.exVat)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="${cur}">${amount(am.total)}</cbc:TaxInclusiveAmount>${allowance ? `
    <cbc:AllowanceTotalAmount currencyID="${cur}">${amount(allowance)}</cbc:AllowanceTotalAmount>` : ''}${charge ? `
    <cbc:ChargeTotalAmount currencyID="${cur}">${amount(charge)}</cbc:ChargeTotalAmount>` : ''}${paid ? `
    <cbc:PrepaidAmount currencyID="${cur}">${amount(paid)}</cbc:PrepaidAmount>` : ''}
    <cbc:PayableAmount currencyID="${cur}">${amount(Math.abs(am.total) - paid)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
${xmlLines}
</${root}>
`
}
