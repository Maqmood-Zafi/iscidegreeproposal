'use client'

import React, { useState, useEffect, useRef, useCallback, MouseEvent } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, AlertCircle, BookOpen, BookMarked, Trash2, Plus, Check, LayoutDashboard } from 'lucide-react';

const DegreeProposal = () => {
  // Initialize state with just ISCI discipline
  const [disciplines, setDisciplines] = useState({ ISCI: [] });
  const [newDiscipline, setNewDiscipline] = useState('');
  const [newCourse, setNewCourse] = useState('');
  const [selectedDiscipline, setSelectedDiscipline] = useState('');
  const [validationResults, setValidationResults] = useState(null);
  const [error, setError] = useState('');
  const [courseSearchResults, setCourseSearchResults] = useState([]);
  const [showCourseDropdown, setShowCourseDropdown] = useState(false);
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [courseTitles, setCourseTitles] = useState({});
  const searchTimeout = useRef<NodeJS.Timeout | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Reset the proposal when the page loads
  useEffect(() => {
    const resetProposal = async () => {
      try {
        const response = await fetch('https://iscidegreeproposal.onrender.com/reset', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        });
        if (response.ok) {
          // Get initial validation
          fetchValidation();
        } else {
          console.error('Failed to reset proposal');
        }
      } catch (_) {
        console.error('Error resetting proposal');
      }
    };

    // Call reset when component mounts
    resetProposal();
    
    // Add click outside listener for dropdown
    const handleClickOutside = (event: MouseEvent): void => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowCourseDropdown(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside as EventListener);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside as EventListener);
    };
  }, []); 

  const fetchValidation = async () => {
    try {
      const response = await fetch('https://iscidegreeproposal.onrender.com/validate');
      const data = await response.json();
      setValidationResults(data);
    } catch (err) {
      console.error('Failed to fetch validation:', err);
    }
  };

  const addDiscipline = async () => {
    if (newDiscipline.trim() === '' || newDiscipline.toLowerCase() === 'isci') {
      setError('Please enter a valid discipline name (cannot be ISCI)');
      return;
    }

    try {
      const response = await fetch('https://iscidegreeproposal.onrender.com/disciplines', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ discipline_name: newDiscipline }),
      });
      const data = await response.json();
      if (data.success) {
        setDisciplines({ ...disciplines, [newDiscipline]: [] });
        setNewDiscipline('');
        setError('');
        // Update validation results
        if (data.validation) {
          setValidationResults(data.validation);
        }
      }
    } catch (_) {
      setError('Failed to add discipline');
    }
  };

  const removeDiscipline = async (disciplineName) => {
    if (disciplineName === 'ISCI') {
      setError('Cannot remove ISCI discipline');
      return;
    }

    try {
      const response = await fetch(`https://iscidegreeproposal.onrender.com/disciplines/${disciplineName}`, {
        method: 'DELETE',
      });
      const data = await response.json();
      if (data.success) {
        const newDisciplines = { ...disciplines };
        delete newDisciplines[disciplineName];
        setDisciplines(newDisciplines);
        setError('');
        
        // Update validation results
        if (data.validation) {
          setValidationResults(data.validation);
        }
      }
    } catch (err) {
      setError('Failed to remove discipline');
    }
  };

  const addCourse = async (disciplineName, courseCode) => {
    if (!disciplineName || !courseCode.trim()) {
      setError('Please enter a course code');
      return;
    }
  
    try {
      const response = await fetch('https://iscidegreeproposal.onrender.com/courses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          discipline_name: disciplineName,
          course_code: courseCode,
        }),
      });
      const data = await response.json();
      if (data.success) {
        setDisciplines(prev => ({
          ...prev,
          [disciplineName]: [...prev[disciplineName], courseCode],
        }));
        setCourseTitles(prev => ({
          ...prev,
          [courseCode]: data.course.title
        }));
        setError('');
        
        if (data.validation) {
          setValidationResults(data.validation);
        }
      } else {
        setError(data.message || 'Course not found or already added');
      }
    } catch (_) {
      setError('Failed to add course');
    }
  };

  const removeCourse = async (disciplineName, courseCode) => {
    try {
      const response = await fetch('https://iscidegreeproposal.onrender.com/courses', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          discipline_name: disciplineName,
          course_code: courseCode,
        }),
      });
      const data = await response.json();
      if (data.success) {
        setDisciplines({
          ...disciplines,
          [disciplineName]: disciplines[disciplineName].filter(
            (course) => course !== courseCode
          ),
        });
        setError('');
        
        // Update validation results
        if (data.validation) {
          setValidationResults(data.validation);
        }
      }
    } catch (_) {
      setError('Failed to remove course');
    }
  };

  const searchCourses = async (query) => {
    if (!query || query.length < 2) {
      setCourseSearchResults([]);
      setShowCourseDropdown(false);
      return;
    }

    // Clear existing timeout
    if (searchTimeout.current) {
      clearTimeout(searchTimeout.current);
    }

    // Set a timeout to prevent too many API calls
    searchTimeout.current = setTimeout(async () => {
      setLoadingCourses(true);
      try {
        const response = await fetch(`https://iscidegreeproposal.onrender.com/search-courses?query=${encodeURIComponent(query)}`);
        const data = await response.json();
        setCourseSearchResults(data);
        setShowCourseDropdown(data.length > 0);
      } catch (err) {
        console.error('Failed to search courses:', err);
        setCourseSearchResults([]);
        setShowCourseDropdown(false);
      } finally {
        setLoadingCourses(false);
      }
    }, 300);
  };
  
  const handleCourseInputChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const value = e.target.value;
    setNewCourse(value);
    searchCourses(value);
  };
  
  const handleCourseInputFocus = () => {
    if (newCourse.length >= 2) {
      setShowCourseDropdown(true);
    }
  };

  const renderStatusIcon = (isCompleted) => {
    return isCompleted ? 
      <CheckCircle className="w-5 h-5 text-green-500" /> : 
      <XCircle className="w-5 h-5 text-red-500" />;
  };
  
  const renderRequirementStatus = (requirement) => {
    return (
      <div className="flex items-center justify-between py-2 border-b border-gray-100">
        <div className="flex-1">
          <span className="text-sm">{requirement.label}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-sm font-medium ${requirement.met ? 'text-green-600' : 'text-red-600'}`}>
            {requirement.actual} / {requirement.required}
          </span>
          {renderStatusIcon(requirement.met)}
        </div>
      </div>
    );
  };

  const getDisciplineStatusColor = (discipline) => {
    if (!validationResults || !validationResults.requirements.disciplines_requirements[discipline]) {
      return "border-gray-300";
    }

    const requirementsMet = 
      validationResults.requirements.disciplines_requirements[discipline].course_count.met &&
      (discipline === "ISCI" || validationResults.requirements.disciplines_requirements[discipline].has_400_level.met);
    
    return requirementsMet ? "border-l-green-500" : "border-l-amber-500";
  };

  const is400LevelCourse = (courseCode) => {
    // Extract the numeric part of the course code
    const match = courseCode.match(/\d+/);
    if (match) {
      const courseNumber = parseInt(match[0], 10);
      return courseNumber >= 400;
    }
    return false;
  };

  // Create a CourseDropdown component
  const CourseDropdown = ({ discipline, onCourseSelect }) => {
    const [searchInput, setSearchInput] = useState('');
    const [results, setResults] = useState([]);
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const searchTimeout = useRef<NodeJS.Timeout | null>(null);
  
    // Search for courses when input changes
    const handleSearch = useCallback(async (query) => {
      if (!query || query.length < 2) {
        setResults([]);
        return;
      }
  
      setLoading(true);
      try {
        const response = await fetch(`https://iscidegreeproposal.onrender.com/search-courses?query=${query}`);
        const data = await response.json();
        setResults(data);
      } catch (err) {
        console.error('Search failed:', err);
      } finally {
        setLoading(false);
      }
    }, []);
  
    // Handle input changes
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
      const value = e.target.value;
      setSearchInput(value);
      
      if (searchTimeout.current) {
        clearTimeout(searchTimeout.current);
      }
      
      searchTimeout.current = setTimeout(() => {
        handleSearch(value);
      }, 300);
    };
  
    // Close dropdown when clicking outside
    useEffect(() => {
      const handleClickOutside = (event: MouseEvent): void => {
        if (
          dropdownRef.current && 
          !dropdownRef.current.contains(event.target as Node) && 
          inputRef.current && 
          !inputRef.current.contains(event.target as Node)
        ) {
          setIsOpen(false);
        }
      };
  
      document.addEventListener('mousedown', handleClickOutside as EventListener);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside as EventListener);
      };
    }, []);
  
    return (
      <div className="relative w-full">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative" ref={dropdownRef}>
            <Input
              ref={inputRef}
              value={searchInput}
              onChange={handleInputChange}
              onFocus={() => setIsOpen(true)}
              placeholder={`Search for courses...`}
              className="flex-1"
            />
            
            {isOpen && (
              <div 
                className="absolute z-50 w-full bg-white shadow-lg rounded-md mt-1 max-h-60 overflow-auto border border-gray-200"
              >
                {loading ? (
                  <div className="p-3 text-center text-gray-500">Loading...</div>
                ) : results.length > 0 ? (
                  results.map((course) => (
                    <div
                      key={course.code}
                      className="p-3 hover:bg-gray-100 cursor-pointer border-b border-gray-100 flex justify-between items-center"
                      onMouseDown={(e) => {
                        e.preventDefault(); // Important: Prevent focus loss
                        onCourseSelect(course.code);
                        setIsOpen(false);
                        setSearchInput('');
                      }}
                    >
                      <div>
                        <div className="font-medium">{course.code}</div>
                        <div className="text-sm text-gray-500">{course.name}</div>
                      </div>
                      <Plus className="w-4 h-4 text-gray-400" />
                    </div>
                  ))
                ) : (
                  <div className="p-3 text-center text-gray-500">
                    {searchInput.length >= 2 ? 'No courses found' : 'Type at least 2 characters'}
                  </div>
                )}
              </div>
            )}
          </div>
          <Button 
            onClick={() => {
              if (searchInput) {
                onCourseSelect(searchInput);
                setSearchInput('');
              }
            }} 
            className="whitespace-nowrap"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 p-6 max-w-7xl mx-auto">
      {/* Main content area */}
      <div className="w-full lg:w-2/3 space-y-6"> 
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl flex items-center gap-2">
              <LayoutDashboard className="w-6 h-6 text-blue-500" />
              ISCI Degree Proposal Builder
            </CardTitle>
            <CardDescription>
              Add disciplines and courses to build your degree proposal
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-4">
                <Input
                  value={newDiscipline}
                  onChange={(e) => setNewDiscipline(e.target.value)}
                  placeholder="Enter discipline name"
                  className="flex-1"
                />
                <Button onClick={addDiscipline} className="whitespace-nowrap">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Discipline
                </Button>
              </div>

              {Object.entries(disciplines).map(([discipline, courses]) => (
                <Card 
                  key={discipline} 
                  className={`p-4 border-l-4 ${getDisciplineStatusColor(discipline)} shadow-sm`}
                >
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 mb-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <BookOpen className="w-5 h-5 text-blue-500" />
                      <h3 className="text-lg font-semibold">{discipline}</h3>
                      {validationResults && validationResults.requirements.disciplines_requirements[discipline] && (
                        <>
                          <Badge variant={validationResults.requirements.disciplines_requirements[discipline].course_count.met ? "success" : "destructive"} className="ml-2">
                            {validationResults.requirements.disciplines_requirements[discipline].course_count.actual}/
                            {validationResults.requirements.disciplines_requirements[discipline].course_count.required} credits
                          </Badge>
                          
                          {discipline !== 'ISCI' && (
                            <Badge variant={validationResults.requirements.disciplines_requirements[discipline].has_400_level.met ? "success" : "destructive"} className="ml-2">
                              {validationResults.disciplines_400_level[discipline] || 0} 400-level courses
                            </Badge>
                          )}
                        </>
                      )}
                    </div>
                    {discipline !== 'ISCI' && (
                      <Button
                        onClick={() => removeDiscipline(discipline)}
                        variant="destructive"
                        size="sm"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Remove
                      </Button>
                    )}
                  </div>

                  {/* Update the course dropdown section */}
                  <div className="relative mb-4">
                    <CourseDropdown 
                      discipline={discipline} 
                      onCourseSelect={(courseCode) => addCourse(discipline, courseCode)} // Now passes both parameters
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    {courses.map((course) => {
                      // Find course title from search results or use empty string
                      const courseData = courseSearchResults.find(c => c.code === course) || 
                        { code: course, name: '' };
                      
                      return (
                        <div
                          key={course}
                          className={`flex justify-between items-center p-3 ${
                            is400LevelCourse(course) ? 'bg-blue-50' : 'bg-gray-50'
                          } rounded-md border border-gray-200 hover:bg-gray-100 transition-colors`}
                        >
                          <div className="flex items-center gap-2 overflow-hidden">
                            <BookMarked 
                              className={`w-4 h-4 flex-shrink-0 ${
                                is400LevelCourse(course) ? 'text-blue-600' : 'text-blue-500'
                              }`} 
                            />
                            <div className="truncate">
                              <span className="font-medium">{course}</span>
                              <span className="text-gray-500 ml-2">-</span>
                              <span className="text-gray-500 ml-2">
                                {courseData.name || courseTitles[course] || ''}
                              </span>
                            </div>
                          </div>
                          <Button
                            onClick={() => removeCourse(discipline, course)}
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 flex-shrink-0 ml-2"
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              ))}

              {error && (
                <Alert variant="destructive">
                  <AlertDescription className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    {error}
                  </AlertDescription>
                </Alert>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sidebar with real-time validation */}
      <div className="w-full lg:w-1/3 space-y-6">
        <Card className="sticky top-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Check className="w-5 h-5" />
              Requirements Status
            </CardTitle>
            <CardDescription>
              Real-time validation of your degree proposal
            </CardDescription>
          </CardHeader>
          <CardContent>
            {validationResults ? (
              <div className="space-y-4">
                {/* Overall status */}
                <div className={`p-3 rounded-md text-white ${validationResults.success ? 'bg-green-500' : 'bg-amber-500'}`}>
                  <h3 className="font-medium flex items-center gap-2">
                    {validationResults.success ? (
                      <>
                        <CheckCircle className="w-5 h-5" /> Valid Proposal
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-5 h-5" /> Requirements Not Met
                      </>
                    )}
                  </h3>
                  {!validationResults.success && validationResults.messages && (
                    <ul className="mt-2 text-sm list-disc pl-5 space-y-1">
                      {validationResults.messages.map((message, index) => (
                        <li key={index}>{message}</li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Program Requirements */}
                <div>
                  <h3 className="font-medium mb-2 text-gray-700">Program Requirements</h3>
                  <div className="space-y-1 bg-gray-50 p-3 rounded-md">
                    {renderRequirementStatus({
                      label: "Disciplines (excluding ISCI)",
                      required: validationResults.requirements.discipline_count.required,
                      actual: validationResults.requirements.discipline_count.actual,
                      met: validationResults.requirements.discipline_count.met
                    })}
                    
                    {renderRequirementStatus({
                      label: "ISCI Credits",
                      required: validationResults.requirements.isci_credits.required,
                      actual: validationResults.requirements.isci_credits.actual.toFixed(1),
                      met: validationResults.requirements.isci_credits.met
                    })}
                    
                    {renderRequirementStatus({
                      label: "Total Discipline Credits",
                      required: validationResults.requirements.total_credits.required,
                      actual: validationResults.requirements.total_credits.actual.toFixed(1),
                      met: validationResults.requirements.total_credits.met
                    })}
                    
                    {renderRequirementStatus({
                      label: "Science Credits (Total)",
                      required: validationResults.requirements.science_credits.required,
                      actual: validationResults.requirements.science_credits.actual.toFixed(1),
                      met: validationResults.requirements.science_credits.met
                    })}
                    
                    {renderRequirementStatus({
                      label: "Science Credits (Non-ISCI)",
                      required: validationResults.requirements.non_isci_science_credits.required,
                      actual: validationResults.requirements.non_isci_science_credits.actual.toFixed(1),
                      met: validationResults.requirements.non_isci_science_credits.met
                    })}
                    
                    {renderRequirementStatus({
                      label: "Honorary Science Credits (Max)",
                      required: validationResults.requirements.honorary_credits.required,
                      actual: validationResults.requirements.honorary_credits.actual.toFixed(1),
                      met: validationResults.requirements.honorary_credits.met
                    })}
                    
                    {renderRequirementStatus({
                      label: "400-level Courses (Total)",
                      required: validationResults.requirements.total_400_level.required,
                      actual: validationResults.requirements.total_400_level.actual,
                      met: validationResults.requirements.total_400_level.met
                    })}
                  </div>
                </div>

                {/* Discipline Requirements */}
                <div>
                  <h3 className="font-medium mb-2 text-gray-700">Discipline Requirements</h3>
                  <div className="space-y-4">
                    {Object.entries(validationResults.requirements.disciplines_requirements).map(([discipline, requirements]) => (
                      <div key={discipline} className="bg-gray-50 p-3 rounded-md">
                        <h4 className="font-medium text-sm mb-2">{discipline}</h4>
                        <div className="space-y-1">
                          {renderRequirementStatus({
                            label: "Minimum Credits",
                            required: requirements.course_count.required,
                            actual: requirements.course_count.actual,
                            met: requirements.course_count.met
                          })}
                          
                          {discipline !== "ISCI" && renderRequirementStatus({
                            label: "Has 400-level Course",
                            required: "Yes",
                            actual: requirements.has_400_level.actual ? "Yes" : "No",
                            met: requirements.has_400_level.met
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-6 text-center">
                <p className="text-gray-500">Loading validation data...</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default DegreeProposal;