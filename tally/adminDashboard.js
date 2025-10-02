    import axios from "axios";
    import { XMLParser } from "fast-xml-parser";

    export const fetchSalesFromTally = async (fromDate, toDate) => {
    try {
        const tallyIP = process.env.TALLY_IP;

        // Build dynamic XML using template literals
        const xmlRequest = `
        <ENVELOPE>
            <HEADER>
            <VERSION>1</VERSION>
            <TALLYREQUEST>Export</TALLYREQUEST>
            <TYPE>Data</TYPE>
            <ID>Sales Register</ID>
            </HEADER>
            <BODY>
            <DESC>
                <STATICVARIABLES>
                <SVFROMDATE>${fromDate}</SVFROMDATE>
                <SVTODATE>${toDate}</SVTODATE>
                </STATICVARIABLES>
            </DESC>
            </BODY>
        </ENVELOPE>
        `;

        const response = await axios.post(tallyIP, xmlRequest, {
        headers: { 'Content-Type': 'text/xml' }
        });

        const parser = new XMLParser({ ignoreAttributes: false });
        const jsonData = parser.parse(response.data);
        return jsonData;

    } catch (error) {
        throw error;
    }
    };

    export const fetchLedgerFromTally = async (fromDate, toDate, ledgerName) => {
  try {
    const tallyIP = process.env.TALLY_IP;

    const xmlRequest = `
    <ENVELOPE>
      <HEADER>
        <VERSION>1</VERSION>
        <TALLYREQUEST>Export</TALLYREQUEST>
        <TYPE>Data</TYPE>
        <ID>Ledger Vouchers</ID>
      </HEADER>
      <BODY>
        <DESC>
          <STATICVARIABLES>
            <SVFROMDATE>${fromDate}</SVFROMDATE>
            <SVTODATE>${toDate}</SVTODATE>
            <LEDGERNAME>${ledgerName}</LEDGERNAME>
            <EXPLODEFLAG>Yes</EXPLODEFLAG>
            <ISDETAILED>Yes</ISDETAILED>
          </STATICVARIABLES>
        </DESC>
      </BODY>
    </ENVELOPE>
    `;

    const response = await axios.post(tallyIP, xmlRequest, {
      headers: { 'Content-Type': 'text/xml' }
    });

    const parser = new XMLParser({ ignoreAttributes: false });
    const jsonData = parser.parse(response.data);
    return jsonData;

  } catch (error) {
    throw error;
  }
};
