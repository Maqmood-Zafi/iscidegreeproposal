'use client'

import React, { useState, useEffect, useRef, useCallback, MouseEvent } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, AlertCircle, BookOpen, BookMarked, Trash2, Plus, Check, LayoutDashboard } from 'lucide-react';

interface BuilderPageProps {
  sessionId: string | null;
  setSessionId: (id: string) => void;
  updateUrlWithSession: (id: string) => void;
}

const BuilderPage: React.FC<BuilderPageProps> = ({ sessionId, setSessionId, updateUrlWithSession }) => {
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
  const [stream, setStream] = useState('regular');
  const [disciplineOrder, setDisciplineOrder] = useState(['ISCI']);
  const [expandedDisciplines, setExpandedDisciplines] = useState(new Set(['ISCI']));
  const [collapsedDisciplines, setCollapsedDisciplines] = useState(new Set());
  const [disciplineErrors, setDisciplineErrors] = useState({});

  // Get base URL helper
  const getBaseUrl = () => {
    if (process.env.NODE_ENV === 'development') {
      return 'http://127.0.0.1:5000';
    }
    return 'https://iscidegreeproposal.onrender.com';
  };

  // API call helper
  const makeApiCall = async (endpoint, method, body = null) => {
    const baseUrl = getBaseUrl();
    const url = new URL(`${baseUrl}${endpoint}`);

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

    if (data.session_id && data.session_id !== sessionId) {
      setSessionId(data.session_id);
      updateUrlWithSession(data.session_id);
    }

    return data;
  };

  // Fetch course titles helper
  const fetchCourseTitles = async (courseCodes) => {
    const promises = courseCodes.map(async (code) => {
      try {
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

    const results = await Promise.all(promises);
    const newTitles = {};
    results.filter(Boolean).forEach(item => {
      if (item) newTitles[item.code] = item.title;
    });
    
    setCourseTitles(prev => ({ ...prev, ...newTitles }));
  };

  // Initialize component
  useEffect(() => {
    const initializeProposal = async () => {
      try {
        if (!sessionId) {
          const data = await makeApiCall('/reset', 'POST');
          if (data.success) {
            fetchValidation();
            setStream('regular');
            setDisciplines({ ISCI: [] });
            setDisciplineOrder(['ISCI']);
          }
        } else {
          const stateData = await makeApiCall('/proposal-state', 'GET');
          if (stateData.disciplines) {
            setDisciplines(stateData.disciplines);
            
            if (stateData.discipline_order) {
              setDisciplineOrder(stateData.discipline_order);
            } else {
              const keys = Object.keys(stateData.disciplines);
              setDisciplineOrder(['ISCI', ...keys.filter(k => k !== 'ISCI')]);
            }
            
            if (stateData.stream) {
              setStream(stateData.stream);
            }
            
            const allCourses = Object.values(stateData.disciplines).flat();
            if (allCourses.length > 0) {
              await fetchCourseTitles(allCourses);
            }
          }
          
          fetchValidation();
        }
      } catch (error) {
        console.error('Error initializing proposal:', error);
      }
    };

    initializeProposal();
    
    const handleClickOutside = (event: MouseEvent): void => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowCourseDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside as EventListener);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside as EventListener);
    };
  }, [sessionId]);

  // Startup message effect
  useEffect(() => {
    if (!sessionId) {
      setShowStartupMessage(true);
      const timer = setTimeout(() => {
        setShowStartupMessage(false);
      }, 10000);
      return () => clearTimeout(timer);
    } else {
      setShowStartupMessage(false);
    }
  }, [sessionId]);

  // API functions
  const fetchValidation = async () => {
    try {
      const data = await makeApiCall('/validate', 'GET');
      setValidationResults(data);
    } catch (err) {
      console.error('Failed to fetch validation:', err);
    }
  };

  const addDiscipline = async () => {
    if (!newDiscipline.trim()) {
      setError('Please enter a discipline name');
      return;
    }

    try {
      const data = await makeApiCall('/disciplines', 'POST', { 
        discipline_name: newDiscipline 
      });
      
      if (data.success) {
        setDisciplines(prev => ({ ...prev, [newDiscipline]: [] }));
        setDisciplineOrder(prev => [...prev, newDiscipline]);
        setNewDiscipline('');
        setError('');
        
        if (data.validation) {
          setValidationResults(data.validation);
        }
      } else {
        setError(data.message || 'Failed to add discipline');
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
      const data = await makeApiCall(`/disciplines/${encodeURIComponent(disciplineName)}`, 'DELETE');
      
      if (data.success) {
        const newDisciplines = { ...disciplines };
        delete newDisciplines[disciplineName];
        setDisciplines(newDisciplines);
        setDisciplineOrder(prev => prev.filter(d => d !== disciplineName));
        setError('');

        if (data.validation) {
          setValidationResults(data.validation);
        }
      } else {
        setError(data.message || 'Unknown error');
      }
    } catch (err) {
      setError(`Failed to remove ${disciplineName}`);
    }
  };

  const addCourse = async (disciplineName, courseCode) => {
    if (!disciplineName || !courseCode.trim()) {
      setDisciplineError(disciplineName, 'Please enter a course code');
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
        
        clearDisciplineError(disciplineName);
        setError('');

        if (data.validation) {
          setValidationResults(data.validation);
        }
      } else {
        setDisciplineError(disciplineName, data.message || 'Course not found or already added');
      }
    } catch (_) {
      setDisciplineError(disciplineName, 'Failed to add course');
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

        if (data.validation) {
          setValidationResults(data.validation);
        }
      }
    } catch (_) {
      setError('Failed to remove course');
    }
  };

  const updateStream = async (newStream) => {
    try {
      const data = await makeApiCall('/set-stream', 'POST', {
        stream: newStream
      });
      
      if (data.success) {
        setStream(newStream);
        if (data.validation) {
          setValidationResults(data.validation);
        }
      } else {
        setError(data.message || 'Failed to update stream');
      }
    } catch (error) {
      setError('Failed to update stream');
      console.error('Error updating stream:', error);
    }
  };

  // Helper functions
  const toggleDisciplineCollapsed = (discipline) => {
    setCollapsedDisciplines(prev => {
      const newSet = new Set(prev);
      if (newSet.has(discipline)) {
        newSet.delete(discipline);
      } else {
        newSet.add(discipline);
      }
      return newSet;
    });
  };

  const setDisciplineError = (discipline, errorMessage) => {
    setDisciplineErrors(prev => ({
      ...prev,
      [discipline]: { message: errorMessage, fading: false }
    }));
    
    setTimeout(() => {
      setDisciplineErrors(prev => ({
        ...prev,
        [discipline]: prev[discipline] ? { ...prev[discipline], fading: true } : undefined
      }));
    }, 4000);
    
    setTimeout(() => {
      setDisciplineErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[discipline];
        return newErrors;
      });
    }, 5000);
  };

  const clearDisciplineError = (discipline) => {
    setDisciplineErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors[discipline];
      return newErrors;
    });
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
    const match = courseCode.match(/\d+/);
    if (match) {
      const courseNumber = parseInt(match[0], 10);
      return courseNumber >= 400;
    }
    return false;
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

  // Course Dropdown Component
  const CourseDropdown = ({ discipline, onCourseSelect, makeApiCall }) => {
    const [searchInput, setSearchInput] = useState('');
    const [results, setResults] = useState([]);
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const searchTimeout = useRef<NodeJS.Timeout | null>(null);

    const handleSearch = useCallback(async (query) => {
      if (!query || query.length < 2) {
        setResults([]);
        setIsOpen(false);
        return;
      }

      setLoading(true);
      try {
        const data = await makeApiCall(`/search-courses?query=${encodeURIComponent(query)}`, 'GET');
        setResults(data.results || []);
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
      if (searchTimeout.current) {
        clearTimeout(searchTimeout.current);
      }

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

  return (
    <div className="flex flex-col lg:flex-row gap-6 p-6 max-w-7xl mx-auto">
      {/* Startup notification */}
      {showStartupMessage && (
        <div className="fixed top-4 left-4 bg-blue-100 border-l-4 border-blue-500 p-5 rounded shadow-lg max-w-md z-50 animate-fade-in">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <svg className="h-6 w-6 text-blue-500" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
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
          <div className="px-6 py-4 bg-blue-50 rounded-lg mb-4">
            <h3 className="text-lg font-semibold mb-2 text-gray-700">Stream Selection</h3>
            <div className="flex flex-wrap gap-2">
              <Button
                variant={stream === 'regular' ? 'default' : 'outline'}
                onClick={() => updateStream('regular')}
                className="flex-1"
              >
                Regular Stream
              </Button>
              <Button
                variant={stream === 'honours' ? 'default' : 'outline'}
                onClick={() => updateStream('honours')}
                className="flex-1"
              >
                Honours Stream
              </Button>
            </div>
            <p className="mt-2 text-sm text-gray-500">
              {stream === 'honours' ? 
                'Honours stream requires more credits and ISCI 449 course.' : 
                'Regular stream has standard requirements.'}
            </p>
          </div>
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

              {disciplineOrder.map((discipline) => {
                const courses = disciplines[discipline];
                if (!courses) return null;
                
                const requirements = validationResults?.requirements?.disciplines_requirements?.[discipline];
                const isCollapsed = collapsedDisciplines.has(discipline);
                const disciplineError = disciplineErrors[discipline];
                
                return (
                  <Card
                    key={discipline}
                    className={`border-l-4 ${getDisciplineStatusColor(discipline)} shadow-sm transition-all duration-200`}
                  >
                    {/* Discipline Header */}
                    <div className="p-4 border-b border-gray-100">
                      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <BookOpen className="w-5 h-5 text-blue-500" />
                          <h3 className="text-lg font-semibold">{discipline}</h3>
                          
                          {/* Status Badges */}
                          {requirements && (
                            <div className="flex gap-2">
                              <Badge 
                                variant={requirements.course_count.met ? "default" : "destructive"}
                                className="text-xs"
                              >
                                {requirements.course_count.actual}/{requirements.course_count.required} credits
                              </Badge>
                              
                              {discipline !== 'ISCI' && (
                                <Badge 
                                  variant={requirements.has_400_level.met ? "default" : "destructive"}
                                  className="text-xs"
                                >
                                  {requirements.has_400_level.actual ? "✓" : "✗"} 400-level
                                </Badge>
                              )}
                              
                              {discipline === 'ISCI' && stream === 'honours' && (
                                <Badge 
                                  variant={disciplines[discipline]?.includes('ISCI 449') ? "default" : "destructive"}
                                  className="text-xs"
                                >
                                  {disciplines[discipline]?.includes('ISCI 449') ? "✓" : "✗"} ISCI 449
                                </Badge>
                              )}
                              
                              <Badge variant="outline" className="text-xs">
                                {courses.length} course{courses.length !== 1 ? 's' : ''}
                              </Badge>
                            </div>
                          )}
                        </div>
                        
                        {discipline !== 'ISCI' && (
                          <Button
                            onClick={() => removeDiscipline(discipline)}
                            variant="destructive"
                            size="sm"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                      
                      {/* Discipline-specific error message with fade animation */}
                      {disciplineError && (
                        <Alert 
                          variant="destructive" 
                          className={`mt-3 ${disciplineError.fading ? 'animate-fade-out' : 'animate-fade-in'}`}
                        >
                          <AlertCircle className="h-4 w-4" />
                          <AlertDescription className="flex items-center justify-between">
                            <span>{disciplineError.message}</span>
                            <Button
                              onClick={() => clearDisciplineError(discipline)}
                              variant="ghost"
                              size="sm"
                              className="h-auto p-1 ml-2"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </Button>
                          </AlertDescription>
                        </Alert>
                      )}
                    </div>

                    {/* Course Management Section with smooth animation */}
                    <div 
                      className={`collapse-transition ${isCollapsed ? 'collapse-exit-active' : 'collapse-enter-active'}`}
                      style={{
                        maxHeight: isCollapsed ? '0px' : '1000px',
                        opacity: isCollapsed ? 0 : 1
                      }}
                    >
                      <div className="p-4">
                        {/* Course Search */}
                        <div className="mb-4">
                          <CourseDropdown
                            discipline={discipline}
                            onCourseSelect={(courseCode) => addCourse(discipline, courseCode)}
                            makeApiCall={makeApiCall}
                          />
                        </div>

                        {/* Course List */}
                        <div className="flex flex-col gap-2">
                          {courses.map((course) => {
                            const courseData = courseSearchResults.find(c => c.code === course) || { code: course, name: '' };
                            const is400Level = is400LevelCourse(course);
                            
                            return (
                              <div
                                key={course}
                                className={`flex justify-between items-center p-3 ${
                                  is400Level ? 'bg-blue-50' : 'bg-gray-50'
                                } rounded-md border border-gray-200 hover:bg-gray-100 transition-colors`}
                              >
                                <div className="flex items-center gap-3 overflow-hidden flex-1">
                                  <BookMarked className={`w-4 h-4 flex-shrink-0 ${is400Level ? 'text-blue-600' : 'text-gray-500'}`} />
                                  <div className="truncate">
                                    <div className="font-medium text-gray-900">{course}</div>
                                    <div className="text-sm text-gray-600 truncate">
                                      {courseData.name || courseTitles[course] || 'Loading...'}
                                    </div>
                                  </div>
                                  {is400Level && (
                                    <Badge variant="secondary" className="text-xs ml-auto mr-2">400-level</Badge>
                                  )}
                                </div>
                                <Button
                                  onClick={() => removeCourse(discipline, course)}
                                  variant="ghost"
                                  size="icon"
                                  className="text-gray-500 hover:text-red-500"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            );
                          })}
                          
                          {courses.length === 0 && (
                            <div className="text-center py-6 text-gray-500">
                              <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-50" />
                              <p>No courses added yet</p>
                              <p className="text-sm">Use the search above to add courses</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Collapse/Expand Toggle */}
                    <div 
                      className="flex justify-center border-t border-gray-100 bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer"
                      onClick={() => toggleDisciplineCollapsed(discipline)}
                    >
                      <div className="px-4 py-2 flex items-center gap-1 text-sm text-gray-600 hover:text-gray-800">
                        <svg 
                          className={`w-4 h-4 transition-transform duration-300 ${isCollapsed ? 'rotate-180' : 'rotate-0'}`} 
                          fill="none" 
                          stroke="currentColor" 
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                        </svg>
                      </div>
                    </div>
                  </Card>
                );
              })}

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
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="font-medium text-gray-700">Program Requirements</h3>
                    <Badge variant={stream === "honours" ? "secondary" : "outline"}>
                      {stream === "honours" ? "Honours Stream" : "Regular Stream"}
                    </Badge>
                  </div>
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

export default BuilderPage;
