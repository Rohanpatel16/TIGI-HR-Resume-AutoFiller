document.addEventListener('DOMContentLoaded', () => {
    const apiKeyInput = document.getElementById('apiKey');
    const modelNameInput = document.getElementById('modelName');
    const fileInput = document.getElementById('resumeFile');
    const processBtn = document.getElementById('processBtn');
    const statusDiv = document.getElementById('status');

    // Load saved settings
    chrome.storage.local.get(['geminiApiKey', 'geminiModel', 'relevantExpOnly'], (result) => {
        if (result.geminiApiKey) {
            apiKeyInput.value = result.geminiApiKey;
        }
        if (result.geminiModel) {
            modelNameInput.value = result.geminiModel;
        }
        if (result.relevantExpOnly) {
            document.getElementById('relevantExpOnly').checked = true;
        }
    });

    // Save settings on change
    const saveSettings = () => {
        chrome.storage.local.set({ 
            geminiApiKey: apiKeyInput.value,
            geminiModel: modelNameInput.value,
            relevantExpOnly: document.getElementById('relevantExpOnly').checked
        });
    };

    apiKeyInput.addEventListener('change', saveSettings);
    modelNameInput.addEventListener('change', saveSettings);
    document.getElementById('relevantExpOnly').addEventListener('change', saveSettings);

    processBtn.addEventListener('click', async () => {
        const apiKey = apiKeyInput.value;
        const model = modelNameInput.value;
        const file = fileInput.files[0];

        if (!apiKey) {
            updateStatus("Please enter your Gemini API Key.");
            return;
        }

        if (!file) {
            updateStatus("Please select a CV file.");
            return;
        }

        updateStatus("Reading file...");
        processBtn.disabled = true;

        try {
            const fileData = await readFileAsBase64(file);
            updateStatus(`Processing with ${model}...`);
            
            const extractedData = await callGeminiAPI(apiKey, model, fileData, file.type);
            
            updateStatus("Filling form...");
            
            // Send to content script
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (!tab || (!tab.url.includes("employer.tigihr.com"))) {
                throw new Error("Please open the TIGI HR 'Add Resume' page first.");
            }

            chrome.scripting.executeScript({
                target: { tabId: tab.id },
                world: 'MAIN',
                args: [extractedData],
                func: async (data) => {
                    const FIELD_IDS = {
                        full_name: '#full_name',
                        email: '#email',
                        mobile: '#mobile_1',
                        mobile_2: '#mobile_2',
                        current_company: '#current_company',
                        offer_inhand: '#offer_inhand',
                        admin_comment: '#admin_comment',
                        summary: '#summary',
                        bio: '#bio',
                        linkedIn_link: '#linkedIn_link',
                        portfolio_link: '#portfolio_link',
                        exp_year: '#exp_year',
                        exp_month: '#exp_month',
                        notice_period: '#notice_period',
                        cur_salary_lakh: '#cur_salary_lakh',
                        cur_salary_thousand: '#cur_salary_thousand',
                        exp_salary_lakh: '#exp_salary_lakh',
                        exp_salary_thousand: '#exp_salary_thousand',
                        gender: '#gender',
                        designation: '#designation',
                        skills: '#skills',
                        qualification: '#qualification',
                        pref_location: '#pref_location',
                        cur_location: '#cur_location',
                        industry: '#industry'
                    };

                    const SEARCH_ENDPOINTS = {
                        skills: '/admin/admins/select2_skill',
                        designation: '/admin/admins/select2_designation',
                        qualification: '/admin/admins/select2_qualification',
                        pref_location: '/admin/admins/select2_location',
                        cur_location: '/admin/admins/select2_location',
                        industry: '/admin/admins/select2_industry'
                    };

                    if (!window.jQuery) {
                        alert("jQuery not found on page. Please ensure you are on the TIGI HR portal.");
                        return;
                    }

                    const $ = window.jQuery;

                    const fetchSelect2Id = async (type, query) => {
                        const endpoint = SEARCH_ENDPOINTS[type];
                        if (!endpoint) return null;

                        const performFetch = async (q) => {
                            const url = `${endpoint}?term=${encodeURIComponent(q)}&_type=query&q=${encodeURIComponent(q)}`;
                            try {
                                const response = await fetch(url);
                                const results = await response.json();
                                return (results && results.length > 0) ? results : null;
                            } catch (e) {
                                console.error(`Error fetching ID for ${type}: ${q}`, e);
                                return null;
                            }
                        };

                        let cleanQuery = query.trim();
                        
                        // 1. Location Sanitization
                        if (type === 'cur_location' || type === 'pref_location') {
                            cleanQuery = cleanQuery.replace(/,?\s*(India|Gujarat|Maharashtra|Karnataka|Tamil\s*Nadu|Delhi|State)\s*$/i, '').trim();
                        }

                        let results = await performFetch(cleanQuery);

                        // 2. Retry Logic for Qualification if no results
                        if (!results && type === 'qualification') {
                            // Try extracting the simplified degree (e.g., "MBA" from "MBA (Finance)")
                            const match = cleanQuery.match(/^([A-Za-z\.]+)/);
                            if (match && match[1] !== cleanQuery) {
                                results = await performFetch(match[1]);
                            }
                        }

                        if (results) {
                            // Try to find an exact case-insensitive match first
                            const exactMatch = results.find(r => r.text.trim().toLowerCase() === cleanQuery.toLowerCase());
                            return exactMatch ? exactMatch.id : results[0].id;
                        }

                        return null;
                    };

                    // 1. Simple Text Inputs
                    const simpleFields = [
                        'full_name', 'email', 'mobile', 'mobile_2', 
                        'current_company', 'offer_inhand', 
                        'admin_comment', 'summary', 'bio', 
                        'linkedIn_link', 'portfolio_link'
                    ];

                    simpleFields.forEach(field => {
                        let value = data[field];
                        if (value !== null && value !== undefined) {
                            // Sanitization for mobile numbers
                            if (field === 'mobile' || field === 'mobile_2') {
                                const digitsOnly = value.toString().replace(/\D/g, '');
                                if (digitsOnly.length > 10) {
                                    value = digitsOnly.slice(-10); // Keep last 10 digits
                                } else {
                                    value = digitsOnly;
                                }
                            }

                            const $el = $(FIELD_IDS[field]);
                            if ($el.length) {
                                $el.val(value).trigger('input').trigger('change').trigger('keyup');
                            }
                        }
                    });

                    // 2. Simple Dropdowns
                    const dropdownFields = [
                        'exp_year', 'exp_month', 'cur_salary_lakh', 'cur_salary_thousand', 
                        'exp_salary_lakh', 'exp_salary_thousand', 'gender'
                    ];

                    dropdownFields.forEach(field => {
                        if (data[field] !== null && data[field] !== undefined) {
                            const $el = $(FIELD_IDS[field]);
                            if ($el.length) {
                                $el.val(data[field]).trigger('change').trigger('change.select2');
                            }
                        }
                    });

                    // 3. Notice Period Mapping
                    if (data.notice_period) {
                        const noticeMap = {
                            'Immediate': '1', '7 Days': '2', '15 Days': '3', 
                            '30 Days': '4', '45 Days': '5', '60 Days': '6', '90 Days': '7'
                        };
                        const val = noticeMap[data.notice_period] || data.notice_period;
                        $(FIELD_IDS.notice_period).val(val).trigger('change');
                    }

                    // 4. Select2 Handling (Async)
                    const handleSelect2 = async (idKey, values) => {
                        const $el = $(FIELD_IDS[idKey]);
                        if (!$el.length || !values) return;
                        
                        const vArr = Array.isArray(values) ? values : [values];
                        const selectedIds = [];

                        for (const val of vArr) {
                            if (!val) continue;
                            const valStr = val.toString().trim();

                            // Check existing options
                            const currentOptions = $el.find('option');
                            let matched = currentOptions.filter(function() {
                                return $(this).text().trim().toLowerCase() === valStr.toLowerCase() || $(this).val() === valStr;
                            });

                            if (matched.length) {
                                selectedIds.push(matched.val());
                            } else {
                                // Fetch ID from server
                                const remoteId = await fetchSelect2Id(idKey, valStr);
                                if (remoteId) {
                                    if (!$el.find(`option[value="${remoteId}"]`).length) {
                                        $el.append(new Option(valStr, remoteId, true, true));
                                    }
                                    selectedIds.push(remoteId);
                                } else {
                                    // Fallback: use text if we can't find an ID (might fail on save)
                                    if (!$el.find(`option[value="${valStr}"]`).length) {
                                        $el.append(new Option(valStr, valStr, true, true));
                                    }
                                    selectedIds.push(valStr);
                                }
                            }
                        }
                        $el.val(selectedIds).trigger('change').trigger('change.select2');
                    };

                    // Fill Select2 fields sequentially to avoid race conditions
                    for (const k of ['designation', 'skills', 'qualification', 'pref_location', 'cur_location', 'industry']) {
                        await handleSelect2(k, data[k]);
                    }
                }
            }, (results) => {
                if (chrome.runtime.lastError) {
                    updateStatus("Error: " + chrome.runtime.lastError.message);
                } else {
                    updateStatus("Success! Form filled.");
                }
                processBtn.disabled = false;
            });


        } catch (error) {
            console.error(error);
            updateStatus("Error: " + error.message);
            processBtn.disabled = false;
        }
    });

    function updateStatus(msg) {
        statusDiv.textContent = msg;
    }

    function readFileAsBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result.split(',')[1]);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    async function callGeminiAPI(apiKey, model, base64Data, mimeType) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

        const isRelevantExp = document.getElementById('relevantExpOnly').checked;
        const currentDate = new Date().toISOString().split('T')[0];

        const expInstruction = isRelevantExp 
            ? `- exp_year: Calculate ONLY the relevant years of experience based on the candidate's primary/target Designation. If a role is marked "Present", calculate duration up to ${currentDate}. (number)\n            - exp_month: Remaining relevant months of experience. (number between 0 and 11. MUST default to 0 if exact years).`
            : `- exp_year: Total years of overall experience across all jobs combined. If a role is marked "Present", calculate duration up to ${currentDate}. (number)\n            - exp_month: Remaining overall months of experience. (number between 0 and 11. MUST default to 0 if exact years).`;

        const prompt = `
            You are an expert technical recruiter with over 10 years of experience in high-growth companies. Your goal is to accurately parse this CV and provide structured data for a candidate management system.

            Extract candidate information and return ONLY a valid JSON object.
            
            Strict Data Requirements:
            - full_name, email, current_company.
            - mobile: Extract the primary phone number. Return ONLY 10 digits (no country code, no spaces). IMPORTANT: if number is 91XXXXXXXXXX, return only XXXXXXXXXX.
            - mobile_2: Extract secondary phone number if present. Return ONLY 10 digits.
            - skills: Identify and extract EVERY technical and soft skill mentioned. Do NOT skip. List them as individual strings.
            - designation: List ONLY the CURRENT or MOST RECENT designation (one string). Do NOT provide a list of all historical roles. 
            ${expInstruction}
            - cur_salary_lakh, cur_salary_thousand, exp_salary_lakh, exp_salary_thousand.
            - notice_period: Must be exactly one of [Immediate, 7 Days, 15 Days, 30 Days, 45 Days, 60 Days, 90 Days].
            - qualification: EXTRACT ONLY THE DEGREE NAME (e.g., "MBA", "B.Tech", "B.Com", "BA", "12th", "10th"). Do not include specialized majors or university names in parentheses.
            - cur_location, pref_location: Provide ONLY THE CITY NAME (e.g., "Ahmedabad", "Mumbai"). DO NOT include state or country names.
            - industry: Identify the most likely industry for this candidate (e.g., "Information Technology", "Banking", "Construction"). Provide one string.
            - gender: male/female.
            - summary: A concise internal summary for the recruiting team.
            - bio: High-quality professional profile bio for the client to read. MUST be between 50 and 220 characters.

            If any data is missing from the CV, use null or an empty string.
            Return ONLY the valid JSON block.
        `;



        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        { text: prompt },
                        { inline_data: { mime_type: mimeType, data: base64Data } }
                    ]
                }]
            })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error?.message || "Gemini API Error");
        }

        const json = await response.json();
        const textResponse = json.candidates[0].content.parts[0].text;
        
        // Robust JSON extraction using Regex
        const jsonMatch = textResponse.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error("Failed to parse JSON from response: " + textResponse);
        }
        return JSON.parse(jsonMatch[0]);
    }
});
