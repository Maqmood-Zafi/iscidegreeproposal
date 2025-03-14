'use client'

import React, { useState, useEffect, useRef, useCallback, MouseEvent } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, AlertCircle, BookOpen, BookMarked, Trash2, Plus, Check, LayoutDashboard } from 'lucide-react';

const DegreeProposal = () => {
  // Add session state
  const [sessionId, setSessionId] = useState(() => {
    if (typeof window !== 'undefined') {
      // Extract from URL or generate new
      const params = new URLSearchParams(window.location.search);
      return params.get('session') || null;
    }
    return null;
  });

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
  const [showStartupMessage, setShowStartupMessage] = useState(false);

  // Update URL with session ID without page reload
  const updateUrlWithSession = useCallback((sid) => {
    if (typeof window !== 'undefined' && sid) {
      const url = new URL(window.location.href);
      url.searchParams.set('session', sid);
      window.history.replaceState({}, '', url);
    }
  }, []);

  // Create a helper function for API calls to handle session
  const makeApiCall = async (endpoint, method, body = null) => {
    const url = new URL(`https://iscidegreeproposal.onrender.com${endpoint}`);

    // Add session ID to URL if available
    if (sessionId) {
      url.searchParams.set('session', sessionId);
    }

    const response = await fetch(url.toString(), {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json();

    // Update session ID if provided in response
    if (data.session_id && data.session_id !== sessionId) {
      setSessionId(data.session_id);
      updateUrlWithSession(data.session_id);
    }

    return data;
  };

  // Reset the proposal when the page loads
  useEffect(() => {
    const initializeProposal = async () => {
      try {
        if (!sessionId) {
          // Only reset if there's no session ID (new user)
          const data = await makeApiCall('/reset', 'POST');
          if (data.success) {
            fetchValidation();
          }
        } else {
          // Fetch the complete state for existing session
          const stateData = await makeApiCall('/proposal-state', 'GET');
          if (stateData.disciplines) {
            setDisciplines(stateData.disciplines);
            
            // Fetch course titles for all existing courses
            const allCourses = Object.values(stateData.disciplines).flat();
            if (allCourses.length > 0) {
              await fetchCourseTitles(allCourses);
            }
          }
          
          // Also fetch validation data
          fetchValidation();
        }
      } catch (error) {
        console.error('Error initializing proposal:', error);
      }
    };

    initializeProposal();
    
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
  }, [sessionId]); // Add sessionId as dependency

  // Add this helper function
  const fetchCourseTitles = async (courseCodes) => {
    // Create a series of promises to fetch course data in parallel
    const promises = courseCodes.map(async (code) => {
      try {
        // Search for the specific course to get its title
        const data = await makeApiCall(`/search-courses?query=${encodeURIComponent(code)}`, 'GET');
        const course = data.results?.find(c => c.code === code);
        if (course) {
          return { code, title: course.name };
        }
      } catch (err) {
        console.error(`Failed to fetch course title for ${code}:`, err);
      }
      return null;
    });
  
    // Wait for all promises to resolve
    const results = await Promise.all(promises);
    
    // Update course titles
    const newTitles = {};
    results.filter(Boolean).forEach(item => {
      if (item) newTitles[item.code] = item.title;
    });
    
    setCourseTitles(prev => ({ ...prev, ...newTitles }));
  };

  // Update all API functions to use makeApiCall
  const fetchValidation = async () => {
    try {
      const data = await makeApiCall('/validate', 'GET');
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
      const data = await makeApiCall('/disciplines', 'POST', {
        discipline_name: newDiscipline
      });

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
      const data = await makeApiCall(`/disciplines/${disciplineName}`, 'DELETE');

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
      const data = await makeApiCall('/courses', 'POST', {
        discipline_name: disciplineName,
        course_code: courseCode,
      });

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
      const data = await makeApiCall('/courses', 'DELETE', {
        discipline_name: disciplineName,
        course_code: courseCode,
      });

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
        const data = await makeApiCall(`/search-courses?query=${encodeURIComponent(query)}`, 'GET');
        setCourseSearchResults(data.results || []);
        setShowCourseDropdown(data.results?.length > 0);
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

  // Complete CourseDropdown component implementation
  const CourseDropdown = ({ discipline, onCourseSelect, makeApiCall }) => {
    const [searchInput, setSearchInput] = useState('');
    const [results, setResults] = useState([]);
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const searchTimeout = useRef<NodeJS.Timeout | null>(null);
  
    // Use the parent's makeApiCall function
    const handleSearch = useCallback(async (query) => {
      if (!query || query.length < 2) {
        setResults([]);
        setIsOpen(false);
        return;
      }
  
      setLoading(true);
      try {
        // Use parent's makeApiCall function instead of direct fetch
        const data = await makeApiCall(`/search-courses?query=${encodeURIComponent(query)}`, 'GET');
        setResults(data.results || []); // Access the results property
        setIsOpen(data.results?.length > 0);
      } catch (err) {
        console.error('Search failed:', err);
        setResults([]);
        setIsOpen(false);
      } finally {
        setLoading(false);
      }
    }, [makeApiCall]);
  
    useEffect(() => {
      // Clear existing timeout
      if (searchTimeout.current) {
        clearTimeout(searchTimeout.current);
      }
  
      // Set a timeout to prevent too many API calls
      searchTimeout.current = setTimeout(() => {
        handleSearch(searchInput);
      }, 300);
  
      return () => {
        if (searchTimeout.current) {
          clearTimeout(searchTimeout.current);
        }
      };
    }, [searchInput, handleSearch]);
  
    const handleInputChange = (e) => {
      setSearchInput(e.target.value);
    };
  
    const handleInputFocus = () => {
      if (searchInput.length >= 2) {
        setIsOpen(true);
      }
    };
  
    const handleItemClick = (courseCode) => {
      onCourseSelect(courseCode);
      setSearchInput('');
      setIsOpen(false);
    };
  
    return (
      <div className="relative w-full" ref={dropdownRef}>
        <div className="flex w-full">
          <Input
            ref={inputRef}
            value={searchInput}
            onChange={handleInputChange}
            onFocus={handleInputFocus}
            placeholder={`Search courses for ${discipline}`}
            className="flex-1"
          />
        </div>
        {isOpen && (
          <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg">
            {loading ? (
              <div className="p-4 text-center text-gray-500">Searching...</div>
            ) : (
              <ul className="max-h-64 overflow-auto">
                {results.map((course) => (
                  <li
                    key={course.code}
                    className="px-4 py-2 hover:bg-gray-100 cursor-pointer flex flex-col"
                    onClick={() => handleItemClick(course.code)}
                  >
                    <span className="font-medium">{course.code}</span>
                    <span className="text-sm text-gray-600">{course.name}</span>
                  </li>
                ))}
                {results.length === 0 && (
                  <li className="px-4 py-2 text-gray-500">No results found</li>
                )}
              </ul>
            )}
          </div>
        )}
      </div>
    );
  };

  // Add this useEffect to manage the startup message visibility
  useEffect(() => {
    // Only show message for new visitors (no session ID)
    if (!sessionId) {
      setShowStartupMessage(true);
      
      // Hide message after 10 seconds
      const timer = setTimeout(() => {
        setShowStartupMessage(false);
      }, 10000);
      
      return () => clearTimeout(timer);
    } else {
      // User already has a session, don't show message
      setShowStartupMessage(false);
    }
  }, [sessionId]);

  return (
    <div className="flex flex-col lg:flex-row gap-6 p-6 max-w-7xl mx-auto">
      {/* Startup notification */}
      {showStartupMessage && (
        <div className="fixed top-4 left-4 bg-blue-100 border-l-4 border-blue-500 p-5 rounded shadow-lg max-w-md z-50 animate-fade-in">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <svg className="h-6 w-6 text-blue-500" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3 flex-grow">
              <p className="text-base font-medium text-blue-800">
                Please allow up to 90 seconds for Backend service to start up on initial load
              </p>
            </div>
            <div className="ml-auto pl-3">
              <div className="-mx-1.5 -my-1.5">
                <button
                  onClick={() => setShowStartupMessage(false)}
                  className="inline-flex bg-blue-50 rounded-md p-1.5 text-blue-500 hover:bg-blue-100 focus:outline-none"
                >
                  <span className="sr-only">Dismiss</span>
                  <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
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
                      makeApiCall={makeApiCall} // Pass the function down
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