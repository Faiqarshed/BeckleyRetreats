'use client';

import React, { useState, useEffect, useMemo, use } from 'react'; 
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import axios from 'axios';

interface TypeformField {
  id: string;
  field_id: string;
  field_title: string;
  field_type: string;
  field_ref: string | null;
  properties: any;
  is_scored: boolean;
  parent_field_version_id: string | null;
  hierarchy_level: number;
  version_date: string;
  is_active: boolean;
  children?: TypeformField[];
  display_order: number | null;
}

interface TypeformChoice {
  id: string;
  display_order: number | null;
  field_version_id: string;
  choice_id: string;
  choice_label: string;
  choice_ref: string | null;
  version_date: string;
  is_active: boolean;
}

interface ScoringRule {
  id: string;
  target_type: 'field' | 'choice';
  target_id: string;
  score_value: 'red' | 'yellow' | 'green' | 'na';
  criteria: any;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  is_active: boolean;
}

export default function ScoringConfiguration({ params }: { params: Promise<{ formId: string }> }) {
  const router = useRouter();
  const resolvedParams = use(params);
  const formId = resolvedParams.formId;
  
  const [expandedField, setExpandedField] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState<string>('');
  const [fields, setFields] = useState<TypeformField[]>([]);
  const [choices, setChoices] = useState<TypeformChoice[]>([]);
  const [existingRules, setExistingRules] = useState<ScoringRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hideNotApplicable, setHideNotApplicable] = useState(false);

  useEffect(() => {
    const loadFormData = async () => {
      try {
        setLoading(true);
        
        const formResponse = await axios.get(`/api/typeform/forms/${formId}`);
        setFormTitle(formResponse.data.form?.title || `Form ${formId}`);
        
        const fieldsResponse = await axios.get(`/api/typeform/forms/${formId}/fields`);
        const rawFields = fieldsResponse.data.fields;
        
        const sortedFields = rawFields.sort((a: TypeformField, b: TypeformField) => 
          (a.display_order ?? Infinity) - (b.display_order ?? Infinity)
        );
        
        const processedFields = buildFieldHierarchy(sortedFields);
        
        setFields(processedFields);
        setChoices(fieldsResponse.data.choices);
        
        const fieldIds = rawFields.map((field: TypeformField) => field.id).join(',');
        const choiceIds = fieldsResponse.data.choices.map((choice: TypeformChoice) => choice.id).join(',');
        
        const fieldScoringResponse = await axios.get(`/api/typeform/scoring?targetType=field&targetIds=${fieldIds}`);
        const fieldRules = fieldScoringResponse.data.rules || [];
        
        const choiceScoringResponse = await axios.get(`/api/typeform/scoring?targetType=choice&targetIds=${choiceIds}`);
        const choiceRules = choiceScoringResponse.data.rules || [];
        
        setExistingRules([...fieldRules, ...choiceRules]);
        
        setLoading(false);
      } catch (error) {
        console.error('Error loading form data:', error);
        setError('Failed to load form data. Please try again.');
        setLoading(false);
      }
    };
    
    loadFormData();
  }, [formId]);
  
  useEffect(() => {
    const setupAutoNAFields = async () => {
      if (fields.length > 0) {
        const autoNAFields = fields.filter(field => 
          (field.field_type === 'group' || field.field_type === 'multiple_choice') && 
          !existingRules.some(rule => rule.target_id === field.id)
        );
        
        if (autoNAFields.length > 0) {
          console.log(`Auto-setting ${autoNAFields.length} fields to N/A (${autoNAFields.filter(f => f.field_type === 'group').length} group fields and ${autoNAFields.filter(f => f.field_type === 'multiple_choice').length} multiple_choice fields)`);
          
          // Instead of awaiting each call in a for loop (which causes race conditions),
          // prepare and batch the operations
          const batchUpdateState = (fieldsToUpdate: TypeformField[]) => {
            // Create a single state update with all new temp rules
            const timestamp = Date.now();
            const newTempRules: ScoringRule[] = fieldsToUpdate.map((field, index) => ({
              id: `temp-batch-${timestamp}-${index}`,
              target_type: 'field',
              target_id: field.id,
              score_value: 'na',
              criteria: {},
              created_by: null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              is_active: true
            }));
            
            // Update state once with all new rules
            setExistingRules(prevRules => [...prevRules, ...newTempRules]);
            
            // Return the mapping of fields to their temp IDs for API updates
            return fieldsToUpdate.map((field, index) => ({
              field,
              tempId: `temp-batch-${timestamp}-${index}`
            }));
          };
          
          // Add all temp rules in a single state update
          const fieldMappings = batchUpdateState(autoNAFields);
          
          // Now make the API calls sequentially but without updating state after each one
          for (const { field, tempId } of fieldMappings) {
            try {
              const payload = {
                targetType: 'field',
                targetId: field.id,
                scoreValue: 'na',
                criteria: {}
              };
              
              const response = await axios.post('/api/typeform/scoring', payload);
              const realRuleId = response.data.ruleId;
              
              // Update just this one temp ID to real ID
              if (realRuleId) {
                setExistingRules(prevRules =>
                  prevRules.map(rule => (rule.id === tempId ? { ...rule, id: realRuleId } : rule))
                );
              }
            } catch (error) {
              console.error(`Failed to auto-set ${field.field_type} field ${field.id} to N/A:`, error);
              // On error, remove the temporary rule
              setExistingRules(prevRules => prevRules.filter(rule => rule.id !== tempId));
            }
          }
        }
      }
    };
    
    if (!loading && fields.length > 0 && existingRules.length > 0) {
      setupAutoNAFields();
    }
  }, [fields, existingRules, loading]);

  const fieldScores = useMemo(() => {
    const scores = new Map<string, 'red' | 'yellow' | 'green' | 'na'>();
    existingRules.forEach(rule => {
      if (rule.target_type === 'field') {
        scores.set(rule.target_id, rule.score_value);
      }
    });
    return scores;
  }, [existingRules]);

  const filterFieldsRecursive = (fieldsToFilter: TypeformField[]): TypeformField[] => {
    if (!hideNotApplicable) {
      return fieldsToFilter; 
    }

    const results: TypeformField[] = [];
    for (const field of fieldsToFilter) {
      const filteredChildren = field.children ? filterFieldsRecursive(field.children) : undefined;

      const score = fieldScores.get(field.id); 

      let keepField = true;
      if (hideNotApplicable && score === 'na') {
          keepField = filteredChildren ? filteredChildren.length > 0 : false;
      }

      if (keepField) {
        results.push({ ...field, children: filteredChildren });
      }
    }
    return results;
  };

  const displayedFields = useMemo(() => {
    return filterFieldsRecursive(fields);
  }, [fields, hideNotApplicable, fieldScores]); 

  const getScoreColorClass = (score: string): string => {
    switch (score) {
      case 'green': return 'bg-green-100 text-green-800';
      case 'yellow': return 'bg-yellow-100 text-yellow-800';
      case 'red': return 'bg-red-100 text-red-800';
      case 'na': return 'bg-gray-100 text-gray-800';
      default: return 'border-gray-300'; 
    }
  };

  const buildFieldHierarchy = (flatFields: TypeformField[]): TypeformField[] => {
    const fieldMap: Record<string, TypeformField> = {};
    
    const childrenByParentId: Record<string, TypeformField[]> = {};
    
    const orderedFieldsByLevel: Record<number, TypeformField[]> = {};
    
    flatFields.forEach(field => {
      const fieldCopy = { ...field, children: [] };
      fieldMap[field.id] = fieldCopy;
      
      const level = field.hierarchy_level || 0;
      if (!orderedFieldsByLevel[level]) {
        orderedFieldsByLevel[level] = [];
      }
      orderedFieldsByLevel[level].push(fieldCopy);
      
      if (field.parent_field_version_id) {
        if (!childrenByParentId[field.parent_field_version_id]) {
          childrenByParentId[field.parent_field_version_id] = [];
        }
        childrenByParentId[field.parent_field_version_id].push(fieldCopy);
      }
    });
    
    const rootFields = orderedFieldsByLevel[0] || [];
    
    Object.keys(childrenByParentId).forEach(parentId => {
      if (fieldMap[parentId] && childrenByParentId[parentId].length > 0) {
        fieldMap[parentId].children = childrenByParentId[parentId];
      }
    });
    
    return rootFields;
  };

  const renderFieldRows = (fieldsToRender: TypeformField[], indentLevel: number = 0): React.ReactNode[] | null => {
    if (!fieldsToRender || fieldsToRender.length === 0) return null;
    
    const allRows: React.ReactNode[] = [];

    fieldsToRender.forEach((field) => {
      const existingFieldRule = existingRules.find(r => r.target_type === 'field' && r.target_id === field.id);
      const currentFieldScore = existingFieldRule?.score_value || 'Not Set'; 
      const isExpanded = expandedField === field.id;
      const choicesForField = choices.filter(choice => choice.field_version_id === field.id); 
 
      if (hideNotApplicable && field.field_type === 'multiple_choice' && choicesForField.length > 0) {
        const allChoicesNA = choicesForField.every(choice => {
          const choiceRule = existingRules.find(r => r.target_type === 'choice' && r.target_id === choice.id);
          return choiceRule?.score_value === 'na';
        });
        if (allChoicesNA) {
          return; 
        }
      }

      const isFieldNA = currentFieldScore === 'na';
      if (hideNotApplicable && isFieldNA && field.field_type !== 'group') {
        return;
      }

      allRows.push(
        <tr key={field.id} className={isFieldNA ? 'bg-gray-100' : ''}>
          <td className="px-6 py-4 text-sm text-gray-500">
            <div className="flex items-start">
              <div style={{ marginLeft: `${indentLevel * 20}px` }} className="truncate">
                {(() => {
                  // Format the field type for better readability
                  if (field.field_type === 'multiple_choice') return 'multiple choice';
                  if (field.field_type === 'yes_no') return 'yes/no';
                  if (field.field_type === 'opinion_scale') return 'opinion scale';
                  // For any other field types with underscores, replace with spaces
                  return field.field_type.replace(/_/g, ' ');
                })()}
              </div>
            </div>
          </td>
          <td className="px-6 py-4 text-sm text-gray-900">
            <div className="line-clamp-2 break-words">{field.field_title}</div>
          </td>
          <td className="px-6 py-4 text-sm text-gray-500">
            <div className="truncate">{field.field_id}</div>
          </td>
          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
            {field.field_type !== 'group' && 
             field.field_type !== 'multiple_choice' && 
             field.field_type !== 'yes_no' &&
             field.field_type !== 'opinion_scale' ? (
              <select
                value={currentFieldScore}
                onChange={(e) => saveFieldScoring(field.id, e.target.value)}
                className={`p-1 border rounded ${getScoreColorClass(currentFieldScore)}`}
              >
                <option value="Not Set" disabled>Not Set</option> 
                <option value="green">Green</option>
                <option value="yellow">Yellow</option>
                <option value="red">Red</option>
                <option value="na">N/A</option>
              </select>
            ) : (
              <></> 
            )}
          </td>
          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
            {field.field_type !== 'group' && field.field_type !== 'multiple_choice' && field.field_type !== 'yes_no' && existingFieldRule && (
              <button 
                onClick={() => clearFieldScoring(existingFieldRule.id)}
                className="text-red-600 hover:text-red-900"
                title="Clear field scoring"
              >
                Clear
              </button>
            )}
            {(field.field_type === 'multiple_choice' || field.field_type === 'opinion_scale' || field.field_type === 'yes_no') && 
             (choicesForField.length > 0 || field.field_type === 'yes_no') && (
              <button
                onClick={() => setExpandedField(expandedField === field.id ? null : field.id)}
                className="ml-2 text-blue-600 hover:text-blue-900"
              >
                {isExpanded ? 'Collapse' : 'Expand'} Choices
              </button>
            )}
          </td>
        </tr>
      );

      // Only show yes_no options when the field is expanded
      if (isExpanded && field.field_type === 'yes_no') {
        const yesNoOptions = [
          { label: 'Yes', criteriaValue: 'yes' },
          { label: 'No', criteriaValue: 'no' },
        ];
        
        // Add each yes/no option as a proper table row with consistent column structure
        yesNoOptions.forEach(option => {
          const optionRule = existingRules.find(
            (r) =>
              r.target_type === 'field' &&
              r.target_id === field.id &&
              JSON.stringify(r.criteria || {}) === JSON.stringify({ answer: option.criteriaValue })
          );
          const currentOptionScore = optionRule?.score_value || 'Not Set';
          const isOptionNA = currentOptionScore === 'na';
          
          if (hideNotApplicable && isOptionNA) {
            return; 
          }
          
          allRows.push(
            <tr key={`${field.id}-${option.criteriaValue}`} className={isOptionNA ? 'bg-gray-100' : ''}>
              <td className="px-6 py-4 text-sm text-gray-500">
                <div className="flex items-start">
                  <div style={{ marginLeft: `${(indentLevel + 1) * 20}px` }} className="truncate">
                    ↳ Choice
                  </div>
                </div>
              </td>
              <td className="px-6 py-4 text-sm text-gray-900">
                <div className="truncate">{option.label}</div>
              </td>
              <td className="px-6 py-4 text-sm text-gray-500">
                {/* Field ID column - intentionally empty for choices */}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                <select
                  value={currentOptionScore} 
                  onChange={(e) => 
                    saveFieldScoring(field.id, e.target.value, { answer: option.criteriaValue })
                  }
                  className={`p-1 border rounded ${getScoreColorClass(currentOptionScore)}`}
                >
                  <option value="Not Set" disabled>Not Set</option>
                  <option value="green">Green</option>
                  <option value="yellow">Yellow</option>
                  <option value="red">Red</option>
                  <option value="na">N/A</option>
                </select>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                {optionRule && (
                  <button
                    onClick={() => clearFieldScoring(optionRule.id)}
                    className="text-red-600 hover:text-red-900"
                    title={`Clear ${option.label} scoring`}
                  >
                    Clear
                  </button>
                )}
              </td>
            </tr>
          );
        });
      }

      if (isExpanded && choicesForField.length > 0) {
        // Display multiple choice options similar to yes/no options - in proper table rows
        choicesForField
          .sort((a, b) => (a.display_order ?? Infinity) - (b.display_order ?? Infinity))
          .forEach((choice) => {
            const choiceRule = existingRules.find(
              (rule) => rule.target_type === 'choice' && rule.target_id === choice.id
            );
            const currentChoiceScore = choiceRule?.score_value || 'Not Set';
            const isChoiceNA = currentChoiceScore === 'na';

            if (hideNotApplicable && isChoiceNA) {
              return; 
            }

            allRows.push(
              <tr key={choice.id} className={isChoiceNA ? 'bg-gray-100' : ''}>
                <td className="px-6 py-4 text-sm text-gray-500">
                  <div className="flex items-start">
                    <div style={{ marginLeft: `${(indentLevel + 1) * 20}px` }} className="truncate">
                      ↳ Choice
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-gray-900">
                  <div className="truncate">{choice.choice_label}</div>
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  {/* Field ID column - intentionally empty for choices */}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  <select
                    value={currentChoiceScore} 
                    onChange={(e) => saveChoiceScoring(choice.id, e.target.value)}
                    className={`p-1 border rounded ${getScoreColorClass(currentChoiceScore)}`}
                  >
                    <option value="Not Set" disabled>Not Set</option>
                    <option value="green">Green</option>
                    <option value="yellow">Yellow</option>
                    <option value="red">Red</option>
                    <option value="na">N/A</option>
                  </select>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  {choiceRule && (
                    <button 
                      onClick={() => clearChoiceScoring(choiceRule.id)}
                      className="text-red-600 hover:text-red-900"
                      title="Clear choice scoring"
                    >
                      Clear
                    </button>
                  )}
                </td>
              </tr>
            );
          });
      }

      if (field.children && field.children.length > 0) {
        const childrenRows = renderFieldRows(field.children, indentLevel + 1);
        if (childrenRows) {
          allRows.push(...childrenRows);
        }
      }
    });

    return allRows.length > 0 ? allRows : []; 
  };

  const saveFieldScoring = async (fieldVersionId: string, scoringValue: string, criteria?: any) => {
    // Use a functional update to ensure we're working with the latest state
    let tempRuleId = `temp-${Date.now()}`;
    let originalRules: ScoringRule[] = [];

    // Use a state updater function to avoid race conditions
    // and to capture the current state at the time of the update
    setExistingRules(prevRules => {
      // Save a copy for error handling
      originalRules = [...prevRules];
      
      // Check if rule already exists
      const ruleIndex = prevRules.findIndex(
        r => 
          r.target_type === 'field' && 
          r.target_id === fieldVersionId &&
          JSON.stringify(r.criteria || {}) === JSON.stringify(criteria || {})
      );
      
      if (ruleIndex > -1) {
        // Update existing rule
        const updatedRules = [...prevRules];
        updatedRules[ruleIndex] = { 
          ...updatedRules[ruleIndex], 
          score_value: scoringValue as 'red' | 'yellow' | 'green' | 'na',
          updated_at: new Date().toISOString()
        };
        tempRuleId = updatedRules[ruleIndex].id; // Use existing ID if updating
        return updatedRules;
      } else {
        // Create new temporary rule
        const tempNewRule: ScoringRule = {
          id: tempRuleId, 
          target_type: 'field',
          target_id: fieldVersionId,
          score_value: scoringValue as 'red' | 'yellow' | 'green' | 'na',
          criteria: criteria || {},
          created_by: null, // Placeholder
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          is_active: true
        };
        return [...prevRules, tempNewRule];
      }
    });

    try {
      const payload = {
        targetType: 'field',
        targetId: fieldVersionId,
        scoreValue: scoringValue,
        criteria: criteria || {} 
      };

      const response = await axios.post('/api/typeform/scoring', payload);
      const realRuleId = response.data.ruleId;

      if (realRuleId && tempRuleId.startsWith('temp-')) { 
        // Replace temporary ID with real ID from server
        setExistingRules(prevRules =>
          prevRules.map(rule => (rule.id === tempRuleId ? { ...rule, id: realRuleId } : rule))
        );
      }
      // Clear any error that might have been set previously
      setError(null);
    } catch (error) {
      console.error('Error saving field scoring:', error);
      setError('Failed to save field scoring. Please try again.');
      // Restore original rules on error
      setExistingRules(originalRules); 
    }
  };

  const clearFieldScoring = async (ruleId: string) => {
    // Store original rules for error handling
    const originalRules = [...existingRules]; 
    
    // Optimistically update UI by removing the rule
    setExistingRules(prevRules => prevRules.filter(r => r.id !== ruleId));

    try {
      // Only call API if this isn't a temporary ID that hasn't been saved to the database yet
      if (!ruleId.startsWith('temp-') && !ruleId.startsWith('temp-batch-')) {
        await axios.delete(`/api/typeform/scoring?ruleId=${ruleId}`);
      }
      // Clear any error state
      setError(null);
    } catch (error) {
      console.error('Error clearing field scoring:', error);
      setError('Failed to clear field scoring. Please try again.');
      // Restore original state on error
      setExistingRules(originalRules); 
    }
  };

  const clearChoiceScoring = async (ruleId: string) => {
    // Store original rules for error handling
    const originalRules = [...existingRules]; 
    
    // Optimistically update UI by removing the rule
    setExistingRules(prevRules => prevRules.filter(r => r.id !== ruleId));

    try {
      // Only call API if this isn't a temporary ID that hasn't been saved to the database yet
      if (!ruleId.startsWith('temp-') && !ruleId.startsWith('temp-batch-')) {
        await axios.delete(`/api/typeform/scoring?ruleId=${ruleId}`);
      }
      // Clear any error state
      setError(null);
    } catch (error) {
      console.error('Error clearing choice scoring:', error);
      setError('Failed to clear choice scoring. Please try again.');
      // Restore original state on error
      setExistingRules(originalRules); 
    }
  };

  const saveChoiceScoring = async (choiceVersionId: string, scoringValue: string) => {
    const tempRuleId = `temp-${Date.now()}-${Math.random()}`; // Unique temporary ID
    const scoreValueTyped = scoringValue as 'red' | 'yellow' | 'green' | 'na';

    // Optimistic UI update using functional setState
    setExistingRules(prevRules => {
      const ruleIndex = prevRules.findIndex(r => r.target_type === 'choice' && r.target_id === choiceVersionId && r.is_active);

      if (ruleIndex > -1) {
        // Update existing rule
        const updatedRules = [...prevRules];
        updatedRules[ruleIndex] = {
          ...updatedRules[ruleIndex],
          score_value: scoreValueTyped,
          updated_at: new Date().toISOString()
        };
        console.log(`Optimistically updated rule for choice ${choiceVersionId} to ${scoringValue}`);
        return updatedRules;
      } else {
        // Add new temporary rule
        const tempNewRule: ScoringRule = {
          id: tempRuleId,
          target_type: 'choice',
          target_id: choiceVersionId,
          score_value: scoreValueTyped,
          criteria: {}, // Choices don't use criteria
          created_by: null, // Placeholder
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          is_active: true
        };
        console.log(`Optimistically added temp rule ${tempRuleId} for choice ${choiceVersionId} with score ${scoringValue}`);
        return [...prevRules, tempNewRule];
      }
    });

    try {
      // Call the API to save the change
      const payload = {
        targetType: 'choice',
        targetId: choiceVersionId,
        scoreValue: scoringValue,
        criteria: {} // Choices don't use criteria
      };

      const response = await axios.post('/api/typeform/scoring', payload);
      const realRuleId = response.data.ruleId;

      // If API returned a real ruleId (likely means insert succeeded), update the temp rule's ID
      if (realRuleId) {
         setExistingRules(prevRules => {
           const ruleNeedsIdUpdate = prevRules.some(r => r.id === tempRuleId);
           if (ruleNeedsIdUpdate) {
             console.log(`Updating temp rule ID ${tempRuleId} to real ID ${realRuleId}`);
             return prevRules.map(rule =>
               (rule.id === tempRuleId ? { ...rule, id: realRuleId } : rule)
             );
           } else {
             // If temp rule not found, it might have been an update or state changed rapidly.
             // Ensure score consistency for the targetId just in case.
             console.log(`Rule ID ${realRuleId} received, but no temp rule ${tempRuleId} found. Ensuring score consistency for ${choiceVersionId}.`);
             return prevRules.map(rule =>
                (rule.target_type === 'choice' && rule.target_id === choiceVersionId)
                 ? { ...rule, score_value: scoreValueTyped } // Ensure score is up-to-date
                 : rule
             );
           }
         });
      }

      setError(null); // Clear previous errors on success
    } catch (error) {
      console.error(`Error updating choice scoring for ${choiceVersionId}:`, error);
      // Revert optimistic update on error by refetching all data
      console.warn("Failed to save choice score. Reverting optimistic update by refetching rules.");
      const loadFormData = async () => {
        try {
          setLoading(true);
          
          const formResponse = await axios.get(`/api/typeform/forms/${formId}`);
          setFormTitle(formResponse.data.form?.title || `Form ${formId}`);
          
          const fieldsResponse = await axios.get(`/api/typeform/forms/${formId}/fields`);
          const rawFields = fieldsResponse.data.fields;
          
          const sortedFields = rawFields.sort((a: TypeformField, b: TypeformField) => 
            (a.display_order ?? Infinity) - (b.display_order ?? Infinity)
          );
          
          const processedFields = buildFieldHierarchy(sortedFields);
          
          setFields(processedFields);
          setChoices(fieldsResponse.data.choices);
          
          const fieldIds = rawFields.map((field: TypeformField) => field.id).join(',');
          const choiceIds = fieldsResponse.data.choices.map((choice: TypeformChoice) => choice.id).join(',');
          
          const fieldScoringResponse = await axios.get(`/api/typeform/scoring?targetType=field&targetIds=${fieldIds}`);
          const fieldRules = fieldScoringResponse.data.rules || [];
          
          const choiceScoringResponse = await axios.get(`/api/typeform/scoring?targetType=choice&targetIds=${choiceIds}`);
          const choiceRules = choiceScoringResponse.data.rules || [];
          
          setExistingRules([...fieldRules, ...choiceRules]);
          
          setLoading(false);
        } catch (error) {
          console.error('Error loading form data:', error);
          setError('Failed to load form data. Please try again.');
          setLoading(false);
        }
      };
      loadFormData();
      setError('Failed to save score. Please try again.');
    }
  };
  
  return (
    <div className="container mx-auto px-4 py-8 w-full">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Scoring Configuration: {formTitle}</h1>
        <Link href="/admin/typeform" className="text-blue-500 hover:text-blue-700">
          &larr; Back to Forms
        </Link>
      </div>
      
      <div className="mb-4 flex items-center">
        <input
          type="checkbox"
          id="hideNaToggle"
          checked={hideNotApplicable}
          onChange={(e) => setHideNotApplicable(e.target.checked)}
          className="mr-2 h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
        />
        <label htmlFor="hideNaToggle" className="text-sm font-medium text-gray-700">
          Hide N/A Fields
        </label>
      </div>
      
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4" role="alert">
          <p>{error}</p>
        </div>
      )}
      
      {loading ? (
        <p>Loading form fields...</p>
      ) : (
        <div className="bg-white shadow-md rounded px-8 pt-6 pb-8">
          {displayedFields.length > 0 ? (
            <div className="overflow-x-auto shadow rounded-lg">
              <table className="min-w-full divide-y divide-gray-200 table-fixed">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="w-[15%] px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Field Type
                    </th>
                    <th className="w-[30%] px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Field Title
                    </th>
                    <th className="w-[20%] px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Field ID
                    </th>
                    <th className="w-[15%] px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Scoring Value
                    </th>
                    <th className="w-[20%] px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {renderFieldRows(displayedFields)}
                </tbody>
              </table>
            </div>
          ) : (
            <p>{hideNotApplicable ? "No fields match the current filter." : "No fields found."}</p>
          )}
        </div>
      )}
    </div>
  );
}
